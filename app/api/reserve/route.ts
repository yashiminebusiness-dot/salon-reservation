import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { createSquareBooking, cancelSquareBooking } from '@/lib/square'
import { sendBookingConfirmation } from '@/lib/line'

const INTERVAL_DAYS = 3      // 再予約まで必要な日数
const SESSION_MINUTES = 30   // 施術時間（分）

export async function POST(req: NextRequest) {
  // 1. 認証
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error
  const { customer } = auth

  // 2. サブスク会員チェック
  if (customer.subscription_status !== 'active') {
    return NextResponse.json(
      { error: 'Subscription not active', code: 'NOT_MEMBER' },
      { status: 403 }
    )
  }

  // 3. リクエストボディ
  const body = await req.json()
  const { start_at } = body as { start_at: string }

  if (!start_at) {
    return NextResponse.json({ error: 'start_at is required' }, { status: 400 })
  }

  const startAt = new Date(start_at)
  const endAt   = new Date(startAt.getTime() + SESSION_MINUTES * 60 * 1000)

  // 4. 3日間隔チェック（Supabase）
  const { data: recentBookings } = await supabase
    .from('bookings')
    .select('start_at')
    .eq('customer_id', customer.id)
    .in('status', ['confirmed', 'completed'])
    .order('start_at', { ascending: false })
    .limit(1)

  if (recentBookings?.length) {
    const lastDate = new Date(recentBookings[0].start_at)
    const diffDays = (startAt.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
    if (diffDays < INTERVAL_DAYS) {
      return NextResponse.json(
        { error: `Please wait ${INTERVAL_DAYS} days between sessions`, code: 'INTERVAL_RESTRICTION' },
        { status: 409 }
      )
    }
  }

  // 5. Supabase に予約レコードを INSERT（UNIQUE 制約で重複を防ぐ）
  const { data: booking, error: insertError } = await supabase
    .from('bookings')
    .insert({
      customer_id: customer.id,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      status: 'confirmed',
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { error: 'This time slot is already booked', code: 'SLOT_TAKEN' },
        { status: 409 }
      )
    }
    console.error('Supabase insert failed:', insertError)
    return NextResponse.json({ error: 'Database error' }, { status: 500 })
  }

  // 6. Square Appointments で予約作成
  let squareBooking
  try {
    squareBooking = await createSquareBooking({
      startAt: startAt.toISOString(),
      customerId: customer.square_customer_id!,
    })
  } catch (err) {
    console.error('Square booking creation failed:', err)
    await supabase.from('bookings').delete().eq('id', booking.id)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // 7. Supabase の予約レコードを更新（Square ID）
  await supabase
    .from('bookings')
    .update({ square_booking_id: squareBooking.id })
    .eq('id', booking.id)

  // 8. LINE 通知（ドア操作ページURLを送付）
  const doorUrl = `${process.env.NEXT_PUBLIC_APP_URL}/door`
  try {
    await sendBookingConfirmation({
      lineUserId: customer.line_user_id,
      customerName: customer.name ?? 'お客様',
      startAt,
      endAt,
      doorUrl,
    })
  } catch (err) {
    console.error('LINE notification failed:', err)
  }

  return NextResponse.json({
    booking_id: booking.id,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    message: 'ドア操作URLをLINEに送信しました',
  })
}
