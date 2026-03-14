'use client'

import { useEffect, useState } from 'react'
import liff from '@line/liff'
import type { Booking } from '@/types'

export default function BookingsPage() {
  const [ready, setReady] = useState(false)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! }).then(() => {
      if (!liff.isLoggedIn()) { liff.login(); return }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    fetchBookings()
  }, [ready])

  const fetchBookings = async () => {
    setLoading(true)
    try {
      const token = liff.getAccessToken()
      const res = await fetch('/api/bookings', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setBookings(data.bookings)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = async (bookingId: string) => {
    if (!confirm('予約をキャンセルしますか？')) return
    setCancelling(bookingId)
    try {
      const token = liff.getAccessToken()
      const res = await fetch('/api/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ booking_id: bookingId }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error)
      }
      fetchBookings()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'キャンセルに失敗しました')
    } finally {
      setCancelling(null)
    }
  }

  if (!ready || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    )
  }

  const upcomingBookings = bookings.filter(
    (b) => b.status === 'confirmed' && new Date(b.start_at) > new Date()
  )
  const pastBookings = bookings.filter(
    (b) => b.status === 'completed' || (b.status === 'confirmed' && new Date(b.start_at) <= new Date())
  )

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-3">
        <h1 className="text-lg font-bold text-center">予約一覧</h1>
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <div className="px-4 mt-4 space-y-4">
        {upcomingBookings.length === 0 && pastBookings.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <p>予約がありません</p>
            <a href="/reserve" className="text-blue-500 text-sm mt-2 block">
              予約する →
            </a>
          </div>
        )}

        {upcomingBookings.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">upcoming 予定の予約</h2>
            <div className="space-y-3">
              {upcomingBookings.map((booking) => (
                <BookingCard
                  key={booking.id}
                  booking={booking}
                  onCancel={handleCancel}
                  cancelling={cancelling === booking.id}
                />
              ))}
            </div>
          </section>
        )}

        {pastBookings.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold text-gray-500 mb-2">過去の予約</h2>
            <div className="space-y-3">
              {pastBookings.map((booking) => (
                <BookingCard key={booking.id} booking={booking} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function BookingCard({
  booking,
  onCancel,
  cancelling,
}: {
  booking: Booking
  onCancel?: (id: string) => void
  cancelling?: boolean
}) {
  const startAt = new Date(booking.start_at)
  const endAt = new Date(booking.end_at)
  const isPast = startAt <= new Date()
  const canCancel = !isPast && booking.status === 'confirmed' && onCancel

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex justify-between items-start">
        <div>
          <p className="font-medium">
            {startAt.toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'short',
              timeZone: 'Asia/Tokyo',
            })}
          </p>
          <p className="text-gray-600 text-sm mt-1">
            {startAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
            〜
            {endAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })}
          </p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${
          booking.status === 'confirmed' ? 'bg-blue-100 text-blue-700' :
          booking.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
          'bg-green-100 text-green-700'
        }`}>
          {booking.status === 'confirmed' ? '確定' :
           booking.status === 'cancelled' ? 'キャンセル' : '完了'}
        </span>
      </div>

      {canCancel && (
        <button
          onClick={() => onCancel(booking.id)}
          disabled={cancelling}
          className="mt-3 w-full border border-red-300 text-red-600 rounded-lg py-2 text-sm hover:bg-red-50 disabled:opacity-50"
        >
          {cancelling ? 'キャンセル中...' : 'キャンセルする'}
        </button>
      )}
    </div>
  )
}
