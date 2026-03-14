'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function CallbackContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'checking' | 'success' | 'pending'>('checking')

  useEffect(() => {
    const lid = searchParams.get('lid')
    if (!lid) {
      setStatus('pending')
      return
    }

    // サブスク登録状態をポーリング（Webhook が届くまで最大30秒待つ）
    let attempts = 0
    const maxAttempts = 10

    const check = async () => {
      attempts++
      const res = await fetch(`/api/register/status?lid=${encodeURIComponent(lid)}`)
      const data = await res.json()

      if (data.status === 'active') {
        setStatus('success')
        return
      }

      if (attempts < maxAttempts) {
        setTimeout(check, 3000)
      } else {
        // タイムアウト → 「LINEに通知が届きます」と案内
        setStatus('pending')
      }
    }

    check()
  }, [searchParams])

  if (status === 'checking') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mb-4" />
        <p className="text-gray-600 text-center">登録状況を確認中...</p>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <div className="text-5xl mb-4">🎉</div>
        <h1 className="text-2xl font-bold mb-2">登録完了！</h1>
        <p className="text-gray-600 mb-6">
          会員登録が完了しました。
          <br />
          LINEに完了通知をお送りしました。
        </p>
        <a
          href="/reserve"
          className="bg-green-500 text-white font-semibold rounded-lg px-6 py-3 hover:bg-green-600 transition-colors"
        >
          予約する
        </a>
      </div>
    )
  }

  // pending
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
      <div className="text-5xl mb-4">✅</div>
      <h1 className="text-xl font-bold mb-2">お手続きが完了しました</h1>
      <p className="text-gray-600 mb-2">
        LINEに登録完了の通知をお送りします。
        <br />
        しばらくお待ちください。
      </p>
      <p className="text-xs text-gray-400 mt-4">
        通知が届かない場合はLINEよりお問い合わせください
      </p>
    </div>
  )
}

export default function RegisterCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  )
}
