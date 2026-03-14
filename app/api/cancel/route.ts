import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { cancelSquareBooking } from '@/lib/square'
import { deletePasscode } from '@/lib/sesami'
import { sendCancellationConfirmation } from '@/lib/line'

export async function POST(req: NextRequest) {
  // 1. 認証
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error
  const { customer } = auth

  // 2. リクエストボディ
  const body = await req.json()
  const { booking_id } = body as { booking_id: string }

  if (!booking_id) {
    return NextResponse.json({ error: 'booking_id is required' }, { status: 400 })
  }

  // 3. 予約を取得（本人チェック）
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('*')
    .eq('id', booking_id)
    .eq('customer_id', customer.id)  // 本人の予約のみ
    .eq('status', 'confirmed')
    .single()

  if (fetchError || !booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  }

  // 4. SESAMI パスコード削除
  if (booking.sesami_passcode_id) {
    try {
      await deletePasscode(booking.sesami_passcode_id)
    } catch (err) {
      console.error('SESAMI passcode deletion failed:', err)
      // 削除失敗でもキャンセル処理は続行（オーナーに要確認ログ）
    }
  }

  // 5. Square 予約削除
  if (booking.square_booking_id) {
    try {
      await cancelSquareBooking(booking.square_booking_id)
    } catch (err) {
      console.error('Square booking cancellation failed:', err)
    }
  }

  // 6. Supabase ステータスを cancelled に更新
  await supabase
    .from('bookings')
    .update({ status: 'cancelled' })
    .eq('id', booking_id)

  // 7. LINE 通知
  try {
    await sendCancellationConfirmation({
      lineUserId: customer.line_user_id,
      startAt: new Date(booking.start_at),
    })
  } catch (err) {
    console.error('LINE cancellation notification failed:', err)
  }

  return NextResponse.json({ message: 'Booking cancelled successfully' })
}
