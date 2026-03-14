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

  // 6. Square サブスク支払いページの URL を生成
  //    コールバック URL に line_user_id を含める
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/register/callback?lid=${encodeURIComponent(lineUserId)}`

  // NOTE: Square の Subscription は Catalog API でプランを事前作成し、
  //       Checkout API でチェックアウト URL を発行する。
  //       ここでは Square の Payment Link で初回課金 + サブスク開始フローを想定。
  //       詳細は Square ダッシュボードでプランを作成後、その plan_variation_id を使用する。
  const checkoutUrl = `https://checkout.squareup.com/pay/${process.env.SQUARE_PAYMENT_LINK_ID}` +
    `?customer_id=${squareCustomer.id}&redirect_url=${encodeURIComponent(callbackUrl)}`

  return NextResponse.json({ checkout_url: checkoutUrl })
}
