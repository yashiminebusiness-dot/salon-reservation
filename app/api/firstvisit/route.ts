import { NextRequest, NextResponse } from 'next/server'
import { verifyLiffToken } from '@/lib/auth'
import { sendFirstVisitConfirmation } from '@/lib/line'

export async function POST(req: NextRequest) {
  // 1. LIFF トークン検証（LINE user ID 取得のみ・会員チェックなし）
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
  const { name, phone, startAt } = body as { name: string; phone: string; startAt: string }

  if (!name || !phone || !startAt) {
    return NextResponse.json({ error: 'name, phone and startAt are required' }, { status: 400 })
  }

  // 3. LINE で予約確認通知（初回はスタッフ対応のため Square 予約不要）
  try {
    await sendFirstVisitConfirmation({
      lineUserId,
      customerName: name,
      startAt: new Date(startAt),
      phone,
    })
  } catch (err) {
    console.error('LINE notification failed:', err)
    return NextResponse.json({ error: 'Failed to send notification' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
