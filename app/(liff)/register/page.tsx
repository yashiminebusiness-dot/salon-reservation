'use client'

import { useEffect, useState } from 'react'
import liff from '@line/liff'

export default function RegisterPage() {
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const init = async () => {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID! })
      if (!liff.isLoggedIn()) {
        liff.login()
        return
      }
      // LINE プロフィールから名前を自動入力
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
      const token = liff.getAccessToken()
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, email }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 409) {
          setError('すでに会員登録済みです。予約ページからご予約ください。')
          return
        }
        throw new Error(data.error || '登録に失敗しました')
      }

      // Square のサブスク支払いページへリダイレクト
      window.location.href = data.checkout_url
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

  return (
    <div className="min-h-screen bg-white px-4 py-8 max-w-md mx-auto">
      <h1 className="text-2xl font-bold text-center mb-2">会員登録</h1>
      <p className="text-gray-500 text-sm text-center mb-8">
        月額プランへのご登録をお願いします
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="山田 太郎"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            メールアドレス <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="yamada@example.com"
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          <p className="font-medium mb-1">月額プランについて</p>
          <p>・月額 {process.env.NEXT_PUBLIC_SUBSCRIPTION_PRICE ?? '◯,000'}円（税込）</p>
          <p>・毎月自動更新</p>
          <p>・次のステップでクレジットカードをご登録いただきます</p>
        </div>

        <button
          type="submit"
          disabled={loading || !name || !email}
          className="w-full bg-green-500 text-white font-semibold rounded-lg py-3 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-colors"
        >
          {loading ? '処理中...' : 'カード登録・プランを開始する'}
        </button>
      </form>
    </div>
  )
}
