'use client'

import { useEffect, useState } from 'react'
import liff from '@line/liff'

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID_DOOR!

export default function DoorPage() {
  const [ready, setReady] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState<'unlock' | 'lock' | null>(null)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    liff.init({ liffId: LIFF_ID }).then(() => {
      if (!liff.isLoggedIn()) { liff.login(); return }
      const tok = liff.getIDToken()!
      setToken(tok)
      setReady(true)
    }).catch((e) => setError(e.message))
  }, [])

  const handleDoor = async (action: 'unlock' | 'lock') => {
    if (!token) return
    setLoading(action)
    setResult(null)
    try {
      const res = await fetch('/api/door', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({ type: 'error', message: data.error || '操作に失敗しました' })
      } else {
        setResult({
          type: 'success',
          message: action === 'unlock' ? '解錠しました' : '施錠しました',
        })
      }
    } catch {
      setResult({ type: 'error', message: '通信エラーが発生しました' })
    } finally {
      setLoading(null)
    }
  }

  if (!ready) return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-gray-500">読み込み中...</p>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <p className="text-red-500 text-sm">{error}</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-6">
      <div className="text-6xl mb-6">🚪</div>
      <h1 className="text-xl font-bold mb-2">ドア操作</h1>
      <p className="text-gray-500 text-sm mb-8 text-center">
        予約時間内のみ操作できます
      </p>

      {result && (
        <div className={`w-full max-w-xs rounded-lg p-3 mb-6 text-sm text-center ${
          result.type === 'success'
            ? 'bg-green-50 border border-green-200 text-green-700'
            : 'bg-red-50 border border-red-200 text-red-700'
        }`}>
          {result.message}
        </div>
      )}

      <div className="w-full max-w-xs space-y-4">
        <button
          onClick={() => handleDoor('unlock')}
          disabled={loading !== null}
          className="w-full bg-green-500 text-white font-semibold rounded-xl py-5 text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-green-600 transition-colors"
        >
          {loading === 'unlock' ? '解錠中...' : '🔓 解錠する'}
        </button>

        <button
          onClick={() => handleDoor('lock')}
          disabled={loading !== null}
          className="w-full bg-gray-700 text-white font-semibold rounded-xl py-5 text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-800 transition-colors"
        >
          {loading === 'lock' ? '施錠中...' : '🔒 施錠する'}
        </button>
      </div>

      <p className="text-gray-400 text-xs mt-8 text-center">
        退室時は必ず施錠ボタンを押してください
      </p>
    </div>
  )
}
