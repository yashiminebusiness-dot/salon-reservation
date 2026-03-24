import { NextRequest, NextResponse } from 'next/server'
import { verifyLiffToken } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { unlockDoor, lockDoor } from '@/lib/sesame'

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

  const { action } = await req.json() as { action: 'unlock' | 'lock' }
  if (action !== 'unlock' && action !== 'lock') {
    return NextResponse.json({ error: 'action must be unlock or lock' }, { status: 400 })
  }

  // 2. 現在時刻に有効な予約があるか確認
  const now = new Date()
  const { data: customer } = await supabase
    .from('customers')
    .select('id')
    .eq('line_user_id', lineUserId)
    .single()

  if (!customer) {
    return NextResponse.json({ error: '会員情報が見つかりません' }, { status: 403 })
  }

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, start_at, end_at')
    .eq('customer_id', customer.id)
    .eq('status', 'confirmed')
    .lte('start_at', now.toISOString())
    .gte('end_at', now.toISOString())
    .single()

  if (!booking) {
    return NextResponse.json({ error: '現在有効な予約がありません' }, { status: 403 })
  }

  // 3. 解錠 or 施錠
  try {
    if (action === 'unlock') {
      await unlockDoor()
    } else {
      await lockDoor()
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('SESAME API error:', err)
    return NextResponse.json({ error: 'ドアの操作に失敗しました' }, { status: 500 })
  }
}
