'use client'

import { useEffect, useState } from 'react'
import liff from '@line/liff'

type CustomerInfo = {
  name: string | null
  email: string | null
  subscription_status: string
  created_at: string
}

const STATUS_LABEL: Record<string, { label: string; color: string }> = {
  active:   { label: '有効', color: 'bg-green-100 text-green-700' },
  pending:  { label: '支払い待ち', color: 'bg-yellow-100 text-yellow-700' },
  past_due: { label: '支払い遅延', color: 'bg-red-100 text-red-700' },
  cancelled:{ label: '解約済み', color: 'bg-gray-100 text-gray-500' },
}

export default function MyPage() {
  const [ready, setReady] = useState(false)
  const [customer, setCustomer] = useState<CustomerInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! }).then(() => {
      if (!liff.isLoggedIn()) { liff.login(); return }
      setReady(true)
    })
  }, [])

  useEffect(() => {
    if (!ready) return
    const token = liff.getIDToken()
    fetch('/api/mypage', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setCustomer(data.customer)
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'エラーが発生しました')
      })
      .finally(() => setLoading(false))
  }, [ready])

  if (!ready || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-500">読み込み中...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen px-4">
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm text-center">
          {error}
        </div>
      </div>
    )
  }

  if (!customer) return null

  const status = STATUS_LABEL[customer.subscription_status] ?? { label: customer.subscription_status, color: 'bg-gray-100 text-gray-500' }
  const memberSince = new Date(customer.created_at).toLocaleDateString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Tokyo',
  })

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      <div className="bg-white border-b px-4 py-3">
        <h1 className="text-lg font-bold text-center">マイページ</h1>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* 会員情報 */}
        <div className="bg-white rounded-lg border divide-y">
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">お名前</p>
            <p className="font-medium">{customer.name ?? '—'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">メールアドレス</p>
            <p className="font-medium">{customer.email ?? '—'}</p>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-400 mb-1">会員登録日</p>
            <p className="font-medium">{memberSince}</p>
          </div>
        </div>

        {/* サブスクステータス */}
        <div className="bg-white rounded-lg border px-4 py-3">
          <p className="text-xs text-gray-400 mb-2">サブスクリプション</p>
          <div className="flex items-center gap-2">
            <span className={`text-sm px-3 py-1 rounded-full font-medium ${status.color}`}>
              {status.label}
            </span>
            {customer.subscription_status === 'past_due' && (
              <p className="text-xs text-red-600">お支払い情報をご確認ください</p>
            )}
            {customer.subscription_status === 'cancelled' && (
              <p className="text-xs text-gray-500">ご利用ありがとうございました</p>
            )}
          </div>
        </div>

        {/* ナビゲーション */}
        {customer.subscription_status === 'active' && (
          <div className="space-y-2 pt-2">
            <a
              href="/reserve"
              className="block w-full bg-blue-600 text-white text-center py-3 rounded-xl font-medium"
            >
              予約する
            </a>
            <a
              href="/bookings"
              className="block w-full bg-white border text-gray-700 text-center py-3 rounded-xl font-medium"
            >
              予約一覧
            </a>
          </div>
        )}
      </div>
    </div>
  )
}
