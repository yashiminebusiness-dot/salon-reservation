import { NextRequest, NextResponse } from 'next/server'
import { supabase } from './supabase'
import type { Customer } from '@/types'

/**
 * LIFF アクセストークンを検証し、LINE user ID を返す
 */
export async function verifyLiffToken(token: string): Promise<string> {
  const res = await fetch('https://api.line.me/oauth2/v2.1/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      access_token: token,
      client_id: process.env.LIFF_CHANNEL_ID!,
    }),
  })

  if (!res.ok) {
    throw new Error('Invalid LIFF token')
  }

  const data = await res.json()
  if (data.error) throw new Error(data.error_description || 'Token verification failed')

  return data.sub as string // LINE user ID
}

/**
 * リクエストから LIFF トークンを検証し、顧客情報を取得する
 * エラー時は NextResponse を返す（null の場合はハンドリング済み）
 */
export async function authenticate(
  req: NextRequest
): Promise<{ customer: Customer } | { error: NextResponse }> {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  const token = authHeader.slice(7)

  let lineUserId: string
  try {
    lineUserId = await verifyLiffToken(token)
  } catch {
    return { error: NextResponse.json({ error: 'Invalid token' }, { status: 401 }) }
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('line_user_id', lineUserId)
    .single()

  if (error || !customer) {
    return { error: NextResponse.json({ error: 'Customer not found' }, { status: 404 }) }
  }

  return { customer: customer as Customer }
}
