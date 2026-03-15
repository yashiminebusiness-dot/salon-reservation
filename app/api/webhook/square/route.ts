import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { deletePasscode } from '@/lib/sesami'
import { sendRegistrationComplete, sendSubscriptionDeactivated } from '@/lib/line'
import { createSquareSubscription } from '@/lib/square'

/**
 * Square Webhook の署名を検証する
 */
function verifySquareSignature(body: string, signature: string): boolean {
  const secret = process.env.SQUARE_WEBHOOK_SECRET!
  const url = process.env.SQUARE_WEBHOOK_URL!  // e.g. https://your-domain.vercel.app/api/webhook/square

  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(url + body)
  const expected = hmac.digest('base64')

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'base64'),
      Buffer.from(expected, 'base64')
    )
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // 1. 署名検証
  const signature = req.headers.get('x-square-hmacsha256-signature') ?? ''
  const body = await req.text()

  if (!verifySquareSignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  let event: { type: string; data: { object: Record<string, unknown> } }
  try {
    event = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // 2. イベントタイプ別処理
  switch (event.type) {
    case 'subscription.created':
    case 'subscription.updated': {
      await handleSubscriptionCreated(event.data.object)
      break
    }
    case 'subscription.deactivated': {
      await handleSubscriptionDeactivated(event.data.object)
      break
    }
    case 'invoice.payment_failed': {
      await handlePaymentFailed(event.data.object)
      break
    }
    case 'payment.updated': {
      await handlePaymentUpdated(event.data.object)
      break
    }
    default:
      // 未対応イベントは無視（200 を返す）
      break
  }

  return NextResponse.json({ received: true })
}

/**
 * サブスク作成・更新 → ステータスを active に
 */
async function handleSubscriptionCreated(obj: Record<string, unknown>) {
  const subscription = obj.subscription as {
    id: string
    customer_id: string
    status: string
  } | undefined

  if (!subscription) return

  // Square の customer_id で顧客を特定
  const { data: customer } = await supabase
    .from('customers')
    .select('id, line_user_id, name')
    .eq('square_customer_id', subscription.customer_id)
    .single()

  if (!customer) return

  await supabase
    .from('customers')
    .update({
      square_subscription_id: subscription.id,
      subscription_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id)

  // LINE で登録完了通知
  try {
    await sendRegistrationComplete({
      lineUserId: customer.line_user_id,
      customerName: customer.name ?? 'お客様',
      reserveUrl: `${process.env.NEXT_PUBLIC_APP_URL}/reserve`,
    })
  } catch (err) {
    console.error('LINE registration notification failed:', err)
  }
}

/**
 * サブスク失効 → ステータスを cancelled に + 将来の予約をキャンセル
 */
async function handleSubscriptionDeactivated(obj: Record<string, unknown>) {
  const subscription = obj.subscription as {
    id: string
    customer_id: string
  } | undefined

  if (!subscription) return

  const { data: customer } = await supabase
    .from('customers')
    .select('id, line_user_id')
    .eq('square_customer_id', subscription.customer_id)
    .single()

  if (!customer) return

  // ステータス更新
  await supabase
    .from('customers')
    .update({ subscription_status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', customer.id)

  // 将来の confirmed 予約を全てキャンセル
  const now = new Date().toISOString()
  const { data: futureBookings } = await supabase
    .from('bookings')
    .select('id, sesami_passcode_id, square_booking_id')
    .eq('customer_id', customer.id)
    .eq('status', 'confirmed')
    .gt('start_at', now)

  if (futureBookings?.length) {
    for (const booking of futureBookings) {
      // SESAMI PIN 削除
      if (booking.sesami_passcode_id) {
        try { await deletePasscode(booking.sesami_passcode_id) } catch { /* ignore */ }
      }
    }

    // Supabase の status を cancelled に一括更新
    const ids = futureBookings.map((b) => b.id)
    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .in('id', ids)
  }

  // LINE 通知
  try {
    await sendSubscriptionDeactivated({ lineUserId: customer.line_user_id })
  } catch (err) {
    console.error('LINE deactivation notification failed:', err)
  }
}

/**
 * 支払い完了 → サブスクリプション未作成の場合に作成してアクティブ化
 */
async function handlePaymentUpdated(obj: Record<string, unknown>) {
  const payment = obj.payment as {
    status?: string
    order_id?: string
  } | undefined

  console.log('payment.updated received:', JSON.stringify({ status: payment?.status, order_id: payment?.order_id }))

  if (payment?.status !== 'COMPLETED' || !payment.order_id) {
    console.log('payment.updated: skipped (status or order_id missing)', payment?.status, payment?.order_id)
    return
  }

  // order_id から reference_id (lineUserId) を取得
  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  const orderRes = await fetch(`${baseUrl}/v2/orders/${payment.order_id}`, {
    headers: { 'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}` },
  })
  const orderData = await orderRes.json()
  const lineUserId = orderData.order?.reference_id
  console.log('payment.updated: order reference_id (lineUserId):', lineUserId)

  if (!lineUserId) return

  // lineUserId で顧客を検索
  const { data: customer } = await supabase
    .from('customers')
    .select('id, line_user_id, name, subscription_status, square_customer_id')
    .eq('line_user_id', lineUserId)
    .single()

  console.log('payment.updated: customer lookup result:', JSON.stringify(customer))

  if (!customer || customer.subscription_status === 'active') {
    console.log('payment.updated: skipped (no customer or already active)')
    return
  }

  // サブスクリプション作成
  let subscription
  try {
    subscription = await createSquareSubscription(customer.square_customer_id)
  } catch (err) {
    console.error('Subscription creation failed:', err)
    return
  }

  // DB 更新
  await supabase
    .from('customers')
    .update({
      square_subscription_id: subscription.id,
      subscription_status: 'active',
      updated_at: new Date().toISOString(),
    })
    .eq('id', customer.id)

  // LINE 通知は subscription.created webhook 側で行う
}

/**
 * 支払い失敗 → ステータスを past_due に
 */
async function handlePaymentFailed(obj: Record<string, unknown>) {
  const invoice = obj.invoice as { subscription_id?: string } | undefined
  if (!invoice?.subscription_id) return

  await supabase
    .from('customers')
    .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
    .eq('square_subscription_id', invoice.subscription_id)
}
