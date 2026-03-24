import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { getAvailableSlots } from '@/lib/square'
import { supabase } from '@/lib/supabase'
import type { TimeSlot } from '@/types'

const INTERVAL_DAYS = 3
const TIME_SLOTS = [
  '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30',
]

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error
  const { customer } = auth

  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')
  const to   = searchParams.get('to')

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  const startAt = new Date(from + 'T00:00:00+09:00').toISOString()
  const endAt   = new Date(to   + 'T23:59:59+09:00').toISOString()
  const now = new Date()

  // 直近の予約日時を取得（3日間隔チェック用）
  const { data: recentBookings } = await supabase
    .from('bookings')
    .select('start_at')
    .eq('customer_id', customer.id)
    .in('status', ['confirmed', 'completed'])
    .order('start_at', { ascending: false })
    .limit(1)

  const lastBookingDate = recentBookings?.length
    ? new Date(recentBookings[0].start_at)
    : null

  // Square Appointments から空き枠を取得（失敗時は全枠フォールバック）
  let squareSlots: { startAt?: string | null }[] = []
  let isFallback = false

  try {
    squareSlots = await getAvailableSlots({ startAt, endAt })
  } catch {
    isFallback = true
  }

  let slots: TimeSlot[]

  if (isFallback) {
    // フォールバック: 期間内の全枠を生成
    const allSlots: string[] = []
    const start = new Date(from + 'T00:00:00+09:00')
    const end   = new Date(to   + 'T00:00:00+09:00')
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      for (const time of TIME_SLOTS) {
        const [h, m] = time.split(':')
        const slot = new Date(d)
        slot.setHours(Number(h), Number(m), 0, 0)
        allSlots.push(slot.toISOString())
      }
    }

    slots = allSlots.map((startStr) => {
      const slotStart = new Date(startStr)
      if (slotStart <= now) return { start: startStr, available: false, reason: 'already_booked' as const }
      if (lastBookingDate) {
        const diffDays = (slotStart.getTime() - lastBookingDate.getTime()) / (1000 * 60 * 60 * 24)
        if (diffDays < INTERVAL_DAYS) return { start: startStr, available: false, reason: 'interval_restriction' as const }
      }
      return { start: startStr, available: true }
    })
  } else {
    slots = squareSlots
      .filter((sq) => sq.startAt != null)
      .map((sq) => {
        const startStr = sq.startAt as string
        const slotStart = new Date(startStr)
        if (slotStart <= now) return { start: startStr, available: false, reason: 'already_booked' as const }
        if (lastBookingDate) {
          const diffDays = (slotStart.getTime() - lastBookingDate.getTime()) / (1000 * 60 * 60 * 24)
          if (diffDays < INTERVAL_DAYS) return { start: startStr, available: false, reason: 'interval_restriction' as const }
        }
        return { start: startStr, available: true }
      })
  }

  return NextResponse.json({ slots })
}
