'use client'

import { useEffect, useState } from 'react'
import liff from '@line/liff'

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_FIRSTVISIT!

// 予約可能な時間枠（9:00〜17:00、30分刻み）
function generateTimeSlots() {
  const slots = []
  for (let h = 9; h < 17; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    slots.push(`${String(h).padStart(2, '0')}:30`)
  }
  return slots
}

// 今日から4週間分の日付を生成
function generateDates() {
  const dates = []
  const today = new Date()
  for (let i = 1; i <= 28; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    dates.push(d)
  }
  return dates
}

export default function FirstVisitPage() {
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedTime, setSelectedTime] = useState('')

  const dates = generateDates()
  const timeSlots = generateTimeSlots()

  useEffect(() => {
    const init = async () => {
      await liff.init({ liffId: LIFF_ID })
      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }
      const profile = await liff.getProfile()
      setName(profile.displayName)
      setReady(true)
    }
    init().catch((e) => setError(e.message))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const token = liff.getIDToken()
      const startAt = new Date(`${selectedDate}T${selectedTime}:00+09:00`).toISOString()

      const res = await fetch('/api/firstvisit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    )
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4 text-center">
        <div className="text-5xl mb-4">✅</div>
        <h1 className="text-xl font-bold mb-2">予約が完了しました</h1>
        <p className="text-gray-500 text-sm">
          LINEに予約確認メッセージをお送りしました。<br />
          ご来店をお待ちしております！
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white px-4 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-2">初回予約</h1>
      <p className="text-gray-500 text-sm text-center mb-8">
        初回はスタッフがご案内いたします
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 mb-4 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            お名前 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="090-1234-5678"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ご希望日 <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">選択してください</option>
            {dates.map((d) => {
              const value = d.toISOString().split('T')[0]
              const label = d.toLocaleDateString('ja-JP', {
                month: 'long',
                day: 'numeric',
                weekday: 'short',
              })
              return (
                <option key={value} value={value}>{label}</option>
              )
            })}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            ご希望時間 <span className="text-red-500">*</span>
          </label>
          <select
            value={selectedTime}
            onChange={(e) => setSelectedTime(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">選択してください</option>
            {timeSlots.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-medium mb-1">初回ご来店について</p>
          <p>・スタッフがご案内いたします</p>
          <p>・施術時間は約30分です</p>
          <p>・キャンセルはLINEにてご連絡ください</p>
        </div>

        <button
          type="submit"
          disabled={loading || !name || !phone || !selectedDate || !selectedTime}
          className="w-full bg-green-500 text-white font-semibold rounded-lg py-3 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-colors"
        >
          {loading ? '予約中...' : '予約を確定する'}
        </button>
      </form>
    </div>
  )
}
