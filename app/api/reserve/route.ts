import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { createSquareBooking, cancelSquareBooking } from '@/lib/square'
import { createTimedPasscode, deletePasscode } from '@/lib/sesami'
import { sendBookingConfirmation } from '@/lib/line'

const INTERVAL_DAYS = 3       // 再予約まで必要な日数
const PIN_BUFFER_MINUTES = 5  // PIN 有効期間の前後バッファ（分）
const SESSION_MINUTES = 30    // 施術時間（分）

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

  const startAt      = new Date(start_at)
  const endAt        = new Date(startAt.getTime() + SESSION_MINUTES * 60 * 1000)
  const pinValidFrom = new Date(startAt.getTime() - PIN_BUFFER_MINUTES * 60 * 1000)
  const pinValidUntil = new Date(endAt.getTime() + PIN_BUFFER_MINUTES * 60 * 1000)

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

  // 5. Supabase に予約レコードを INSERT（競合状態対策：UNIQUE 制約で重複を防ぐ）
  const { data: booking, error: insertError } = await supabase
    .from('bookings')
    .insert({
      customer_id: customer.id,
      start_at: startAt.toISOString(),
      end_at: endAt.toISOString(),
      pin_valid_from: pinValidFrom.toISOString(),
      pin_valid_until: pinValidUntil.toISOString(),
      status: 'confirmed',
    })
    .select()
    .single()

  if (insertError) {
    // UNIQUE 制約違反 = 同一時間帯に既に予約あり
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
    // ロールバック: Supabase レコードを削除
    await supabase.from('bookings').delete().eq('id', booking.id)
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 })
  }

  // 7. SESAMI パスコード発行
  let passcode: string
  let passcodeId: string
  try {
    const result = await createTimedPasscode({
      validFrom: pinValidFrom,
      validUntil: pinValidUntil,
      name: `予約 ${customer.name} ${startAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`,
    })
    passcode = result.passcode
    passcodeId = result.passcodeId
  } catch (err) {
    console.error('SESAMI passcode creation failed:', err)
    // ロールバック: Square 予約 + Supabase レコードを削除
    await cancelSquareBooking(squareBooking.id!)
    await supabase.from('bookings').delete().eq('id', booking.id)
    return NextResponse.json({ error: 'Failed to issue passcode' }, { status: 500 })
  }

  // 8. Supabase の予約レコードを更新（Square ID + SESAMI ID）
  await supabase
    .from('bookings')
    .update({
      square_booking_id: squareBooking.id,
      sesami_passcode_id: passcodeId,
    })
    .eq('id', booking.id)

  // 9. LINE 通知（失敗してもロールバックしない）
  try {
    await sendBookingConfirmation({
      lineUserId: customer.line_user_id,
      customerName: customer.name ?? 'お客様',
      startAt,
      endAt,
      pinValidFrom,
      pinValidUntil,
      passcode,
    })
  } catch (err) {
    console.error('LINE notification failed:', err)
    // 予約自体は確定済みなのでエラーにしない
  }

  return NextResponse.json({
    booking_id: booking.id,
    start_at: startAt.toISOString(),
    end_at: endAt.toISOString(),
    message: 'PINコードをLINEに送信しました',
  })
}
