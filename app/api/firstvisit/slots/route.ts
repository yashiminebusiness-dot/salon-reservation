import { NextRequest, NextResponse } from 'next/server'
import { verifyLiffToken } from '@/lib/auth'
import { getAvailableSlots } from '@/lib/square'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    await verifyLiffToken(authHeader.slice(7))
  } catch {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const startAt = searchParams.get('startAt')
  const endAt = searchParams.get('endAt')

  if (!startAt || !endAt) {
    return NextResponse.json({ error: 'startAt and endAt are required' }, { status: 400 })
  }

  try {
    const squareSlots = await getAvailableSlots({ startAt, endAt })
    const slots = (squareSlots as { startAt?: string | null }[])
      .filter((s) => s.startAt != null)
      .map((s) => ({ startAt: s.startAt as string, available: true }))
    return NextResponse.json({ slots })
  } catch {
    // Sandbox など Appointments 未対応の場合は全枠を返す（暫定）
    return NextResponse.json({ slots: [], fallback: true })
  }
}
