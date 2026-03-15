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
    customer_id?: string
  } | undefined

  if (payment?.status !== 'COMPLETED' || !payment.customer_id) return

  // 既にサブスク登録済みの場合はスキップ
  const { data: customer } = await supabase
    .from('customers')
    .select('id, line_user_id, name, subscription_status')
    .eq('square_customer_id', payment.customer_id)
    .single()

  if (!customer || customer.subscription_status === 'active') return

  // サブスクリプション作成
  let subscription
  try {
    subscription = await createSquareSubscription(payment.customer_id)
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

  // LINE 登録完了通知
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
