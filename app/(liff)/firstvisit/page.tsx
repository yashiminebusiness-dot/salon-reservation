'use client'

import { useEffect, useState, useCallback } from 'react'
import liff from '@line/liff'

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_FIRSTVISIT!
const TIME_SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
  '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
  '15:00', '15:30', '16:00', '16:30']

function getWeekDates(baseDate: Date) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(baseDate)
    d.setDate(baseDate.getDate() + i)
    return d
  })
}

function toISO(date: Date, time: string) {
  const [h, m] = time.split(':')
  const d = new Date(date)
  d.setHours(Number(h), Number(m), 0, 0)
  // JST → UTC
  return new Date(d.getTime() - 9 * 60 * 60 * 1000).toISOString()
}

export default function FirstVisitPage() {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(0, 0, 0, 0)
    return d
  })
  const [availableSlots, setAvailableSlots] = useState<Set<string>>(new Set())
  const [isFallback, setIsFallback] = useState(false)
  const [selected, setSelected] = useState<{ date: Date; time: string } | null>(null)

  const weekDates = getWeekDates(weekStart)
  const maxWeekStart = (() => {
    const d = new Date()
    d.setDate(d.getDate() + 22)
    return d
  })()

  const fetchSlots = useCallback(async (dates: Date[], tok: string) => {
    const startAt = toISO(dates[0], '00:00')
    const endAt = toISO(dates[6], '23:59')
    try {
      const res = await fetch(
        `/api/firstvisit/slots?startAt=${encodeURIComponent(startAt)}&endAt=${encodeURIComponent(endAt)}`,
        { headers: { Authorization: `Bearer ${tok}` } }
      )
      const data = await res.json()
      if (data.fallback) {
        setIsFallback(true)
        setAvailableSlots(new Set(TIME_SLOTS.flatMap(t => dates.map(d => `${d.toISOString().split('T')[0]}_${t}`))))
      } else {
        setIsFallback(false)
        const set = new Set<string>(
          data.slots.map((s: { startAt: string }) => {
            const d = new Date(s.startAt)
            const dateStr = d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' }).replace(/\//g, '-')
            const timeStr = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' })
            return `${dateStr}_${timeStr}`
          })
        )
        setAvailableSlots(set)
      }
    } catch {
      setIsFallback(true)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      await liff.init({ liffId: LIFF_ID })
      if (!liff.isLoggedIn()) { liff.login(); return }
      const profile = await liff.getProfile()
      setName(profile.displayName)
      const tok = liff.getIDToken()!
      setToken(tok)
      setReady(true)
      await fetchSlots(getWeekDates(weekStart), tok)
    }
    init().catch((e) => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleWeekChange = async (dir: number) => {
    const next = new Date(weekStart)
    next.setDate(weekStart.getDate() + dir * 7)
    setWeekStart(next)
    setSelected(null)
    if (token) await fetchSlots(getWeekDates(next), token)
  }

  const isAvailable = (date: Date, time: string) => {
    const key = `${date.toISOString().split('T')[0]}_${time}`
    return isFallback ? true : availableSlots.has(key)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selected) return
    setLoading(true)
    setError(null)
    try {
      const startAt = toISO(selected.date, selected.time)
      const res = await fetch('/api/firstvisit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, phone, startAt }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '予約に失敗しました')
      setDone(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '予期せぬエラーが発生しました')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">読み込み中...</p>
    </div>
  )

  if (done) return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h1 className="text-xl font-bold mb-2">予約が完了しました</h1>
      <p className="text-gray-500 text-sm">LINEに予約確認メッセージをお送りしました。<br />ご来店をお待ちしております！</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-white px-4 py-6 max-w-md mx-auto">
      <h1 className="text-xl font-bold text-center mb-1">初回予約</h1>
      <p className="text-gray-500 text-xs text-center mb-4">初回はスタッフがご案内いたします</p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {/* カレンダー */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <button
            onClick={() => handleWeekChange(-1)}
            disabled={weekStart <= new Date()}
            className="p-2 rounded-full disabled:opacity-30 hover:bg-gray-100"
          >◀</button>
          <span className="text-sm font-medium">
            {weekDates[0].toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
            〜
            {weekDates[6].toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => handleWeekChange(1)}
            disabled={weekStart >= maxWeekStart}
            className="p-2 rounded-full disabled:opacity-30 hover:bg-gray-100"
          >▶</button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                <th className="w-12 py-1 text-gray-400"></th>
                {weekDates.map((d) => (
                  <th key={d.toISOString()} className="py-1 text-center font-medium">
                    <div>{d.toLocaleDateString('ja-JP', { weekday: 'short' })}</div>
                    <div>{d.getDate()}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TIME_SLOTS.map((time) => (
                <tr key={time}>
                  <td className="py-1 pr-1 text-gray-400 text-right">{time}</td>
                  {weekDates.map((date) => {
                    const avail = isAvailable(date, time)
                    const isSelected = selected?.date.toDateString() === date.toDateString() && selected?.time === time
                    return (
                      <td key={date.toISOString()} className="py-0.5 px-0.5 text-center">
                        <button
                          onClick={() => avail && setSelected({ date, time })}
                          disabled={!avail}
                          className={`w-full rounded text-xs py-1 transition-colors ${
                            isSelected
                              ? 'bg-green-500 text-white font-bold'
                              : avail
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-300 cursor-not-allowed'
                          }`}
                        >
                          {avail ? '○' : '×'}
                        </button>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 選択中の日時 */}
      {selected && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4 text-sm text-center">
          📅 {selected.date.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })} {selected.time}〜
        </div>
      )}

      {/* 入力フォーム */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            お名前 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="山田 太郎"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            電話番号 <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            placeholder="090-1234-5678"
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-500">
          <p>・初回はスタッフがご案内いたします</p>
          <p>・施術時間は約30分です</p>
          <p>・キャンセルはLINEにてご連絡ください</p>
        </div>

        <button
          type="submit"
          disabled={loading || !name || !phone || !selected}
          className="w-full bg-green-500 text-white font-semibold rounded-lg py-3 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-colors"
        >
          {loading ? '予約中...' : '予約を確定する'}
        </button>
      </form>
    </div>
  )
}
