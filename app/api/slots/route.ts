import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { getAvailableSlots } from '@/lib/square'
import type { TimeSlot } from '@/types'

const INTERVAL_DAYS = 3   // 再予約まで必要な日数

export async function GET(req: NextRequest) {
  // 認証
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const { customer } = auth

  // クエリパラメータ取得
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from')  // e.g. '2026-05-01'
  const to   = searchParams.get('to')    // e.g. '2026-05-07'

  if (!from || !to) {
    return NextResponse.json({ error: 'from and to are required' }, { status: 400 })
  }

  // Square Appointments から空き枠を取得
  const startAt = new Date(from + 'T00:00:00+09:00').toISOString()
  const endAt   = new Date(to   + 'T23:59:59+09:00').toISOString()

  let squareSlots: { startAt?: string | null }[] = []
  try {
    squareSlots = await getAvailableSlots({ startAt, endAt })
  } catch (err) {
    console.error('Square availability fetch failed:', err)
    return NextResponse.json({ error: 'Failed to fetch slots' }, { status: 500 })
  }

  // 直近の予約日時を取得（3日間隔チェック用）
  const now = new Date()
  const { data: recentBookings } = await supabaseGetRecentBookings(customer.id)

  // 最後の施術日（cancelled 除く confirmed/completed の最新）
  const lastBookingDate = recentBookings?.length
    ? new Date(recentBookings[0].start_at)
    : null

  // 空き枠に3日ルールを適用
  const slots: TimeSlot[] = squareSlots
    .filter((sq) => sq.startAt != null)
    .map((sq) => {
      const startStr = sq.startAt as string
      const slotStart = new Date(startStr)

      if (slotStart <= now) {
        return { start: startStr, available: false, reason: 'already_booked' as const }
      }

      if (lastBookingDate) {
        const diffDays = (slotStart.getTime() - lastBookingDate.getTime()) / (1000 * 60 * 60 * 24)
        if (diffDays < INTERVAL_DAYS) {
          return { start: startStr, available: false, reason: 'interval_restriction' as const }
        }
      }

      return { start: startStr, available: true }
    })

  return NextResponse.json({ slots })
}

// Supabase ヘルパー（循環インポート回避のためここに定義）
import { supabase } from '@/lib/supabase'

async function supabaseGetRecentBookings(customerId: string) {
  return supabase
    .from('bookings')
    .select('start_at')
    .eq('customer_id', customerId)
    .in('status', ['confirmed', 'completed'])
    .order('start_at', { ascending: false })
    .limit(1)
}
