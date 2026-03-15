'use client'

import { useEffect, useState } from 'react'
import liff from '@line/liff'
import type { TimeSlot } from '@/types'

const DAYS_TO_SHOW = 14  // 2週間分を表示

function getWeekDates(offset: number): Date[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(today.getDate() + offset * 7 + i)
    return d
  })
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })
}

export default function ReservePage() {
  const [ready, setReady] = useState(false)
  const [slots, setSlots] = useState<TimeSlot[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const weekDates = getWeekDates(weekOffset)
  const fromStr = weekDates[0].toISOString().slice(0, 10)
  const toStr   = weekDates[6].toISOString().slice(0, 10)

  useEffect(() => {
    liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! }).then(() => {
      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    fetchSlots()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, weekOffset])

  const fetchSlots = async () => {
    setLoading(true)
    setError(null)
    try {
      const token = liff.getIDToken()
      const res = await fetch(`/api/slots?from=${fromStr}&to=${toStr}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 403) {
          setError('会員登録が完了していません。まず会員登録をお済ませください。')
          return
        }
        throw new Error(data.error)
      }
      setSlots(data.slots)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'エラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    if (!selectedSlot) return
    setSubmitting(true)
    setError(null)

    try {
      const token = liff.getIDToken()
      const res = await fetch('/api/reserve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ start_at: selectedSlot }),
      })
      const data = await res.json()

      if (!res.ok) {
        if (data.code === 'INTERVAL_RESTRICTION') {
          setError('施術から3日間はご予約いただけません。')
        } else if (data.code === 'SLOT_TAKEN') {
          setError('その時間はすでに予約が入っています。別の時間をお選びください。')
          fetchSlots()
        } else if (data.code === 'NOT_MEMBER') {
          setError('会員登録が完了していません。')
        } else {
          setError(data.error || '予約に失敗しました')
        }
        return
      }

      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold mb-2">予約が確定しました！</h1>
        <p className="text-gray-600">PINコードをLINEでお送りしました。</p>
      </div>
    )
  }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    )
  }

  // 日付ごとにスロットをグループ化
  const slotsByDate: Record<string, TimeSlot[]> = {}
  for (const slot of slots) {
    const dateKey = slot.start.slice(0, 10)
    if (!slotsByDate[dateKey]) slotsByDate[dateKey] = []
    slotsByDate[dateKey].push(slot)
  }

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* ヘッダー */}
      <div className="sticky top-0 bg-white border-b px-4 py-3">
        <h1 className="text-lg font-bold text-center">予約する</h1>
        <div className="flex items-center justify-between mt-2">
          <button
            onClick={() => setWeekOffset((w) => Math.max(0, w - 1))}
            disabled={weekOffset === 0}
            className="px-3 py-1 text-sm border rounded disabled:opacity-30"
          >
            ← 前の週
          </button>
          <span className="text-sm text-gray-600">
            {formatDate(weekDates[0])} 〜 {formatDate(weekDates[6])}
          </span>
          <button
            onClick={() => setWeekOffset((w) => w + 1)}
            disabled={weekOffset >= 3}
            className="px-3 py-1 text-sm border rounded disabled:opacity-30"
          >
            次の週 →
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-4 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center mt-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
        </div>
      ) : (
        <div className="px-4 mt-4">
          {weekDates.map((date) => {
            const dateKey = date.toISOString().slice(0, 10)
            const daySlots = slotsByDate[dateKey] ?? []
            if (daySlots.length === 0) return null

            return (
              <div key={dateKey} className="mb-4">
                <h2 className="text-sm font-semibold text-gray-500 mb-2">
                  {formatDate(date)}
                </h2>
                <div className="grid grid-cols-4 gap-2">
                  {daySlots.map((slot) => {
                    const time = new Date(slot.start).toLocaleTimeString('ja-JP', {
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Asia/Tokyo',
                    })
                    const isSelected = selectedSlot === slot.start
                    return (
                      <button
                        key={slot.start}
                        disabled={!slot.available}
                        onClick={() => setSelectedSlot(slot.start)}
                        className={`
                          py-2 rounded text-sm border transition-colors
                          ${!slot.available
                            ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                          }
                        `}
                      >
                        {slot.available ? time : '×'}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 予約確定バー */}
      {selectedSlot && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t px-4 py-3">
          <div className="text-sm text-gray-600 mb-2">
            選択中:{' '}
            {new Date(selectedSlot).toLocaleString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              weekday: 'short',
              hour: '2-digit',
              minute: '2-digit',
              timeZone: 'Asia/Tokyo',
            })}
          </div>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full bg-blue-500 text-white font-semibold rounded-lg py-3 disabled:opacity-50 hover:bg-blue-600 transition-colors"
          >
            {submitting ? '予約中...' : 'この時間で予約する'}
          </button>
        </div>
      )}
    </div>
  )
}
