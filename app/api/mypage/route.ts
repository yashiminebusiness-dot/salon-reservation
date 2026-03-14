import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { getSubscriptionStatus } from '@/lib/square'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const { customer } = auth

  // Square からサブスクステータスを最新取得
  let squareStatus: string | undefined
  if (customer.square_subscription_id) {
    try {
      squareStatus = await getSubscriptionStatus(customer.square_subscription_id)
    } catch {
      // 取得失敗時は DB の値を使う
    }
  }

  return NextResponse.json({
    customer: {
      name: customer.name,
      email: customer.email,
      subscription_status: squareStatus ?? customer.subscription_status,
      created_at: customer.created_at,
    },
  })
}
