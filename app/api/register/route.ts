import { NextRequest, NextResponse } from 'next/server'
import { verifyLiffToken } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { createSquareCustomer } from '@/lib/square'

export async function POST(req: NextRequest) {
  // 1. LIFF トークン検証
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let lineUserId: string
  try {
    lineUserId = await verifyLiffToken(authHeader.slice(7))
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  // 2. リクエストボディ取得
  const body = await req.json()
  const { name, email } = body as { name: string; email: string }

  if (!name || !email) {
    return NextResponse.json({ error: 'name and email are required' }, { status: 400 })
  }

  // 3. 既存会員チェック
  const { data: existing } = await supabase
    .from('customers')
    .select('id, subscription_status')
    .eq('line_user_id', lineUserId)
    .single()

  if (existing && existing.subscription_status === 'active') {
    return NextResponse.json({ error: 'Already registered' }, { status: 409 })
  }

  // 4. Square Customer 作成
  let squareCustomer
  try {
    squareCustomer = await createSquareCustomer({ name, email, lineUserId })
  } catch (err) {
    console.error('Square Customer creation failed:', err)
    return NextResponse.json({ error: 'Failed to create customer' }, { status: 500 })
  }

  // 5. Supabase に会員情報を upsert
  const { error: upsertError } = await supabase
    .from('customers')
    .upsert({
      line_user_id: lineUserId,
      name,
      email,
      square_customer_id: squareCustomer.id,
      subscription_status: 'pending',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'line_user_id' })

  if (upsertError) {
    console.error('Supabase upsert failed:', upsertError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // 6. Square サブスク支払いページの URL を動的生成
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/register/callback?lid=${encodeURIComponent(lineUserId)}`
  const baseUrl = process.env.SQUARE_ENVIRONMENT === 'sandbox'
    ? 'https://connect.squareupsandbox.com'
    : 'https://connect.squareup.com'

  const checkoutRes = await fetch(`${baseUrl}/v2/online-checkout/payment-links`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      idempotency_key: `register-${lineUserId}-${Date.now()}`,
      subscription_plan_variation_id: process.env.SQUARE_SUBSCRIPTION_PLAN_VARIATION_ID,
      order: {
        location_id: process.env.SQUARE_LOCATION_ID,
        line_items: [{
          name: '月額ホワイトニングプラン',
          quantity: '1',
          base_price_money: { amount: 5000, currency: 'JPY' },
        }],
      },
      pre_populated_data: {
        buyer_email: email,
      },
      checkout_options: {
        redirect_url: callbackUrl,
      },
    }),
  })

  const checkoutData = await checkoutRes.json()
  if (!checkoutRes.ok || !checkoutData.payment_link?.url) {
    console.error('Square checkout creation failed:', JSON.stringify(checkoutData))
    return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })
  }

  return NextResponse.json({ checkout_url: checkoutData.payment_link.url })
}
