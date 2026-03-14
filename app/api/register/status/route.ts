import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// コールバックページからのポーリング用（認証不要）
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lid = searchParams.get('lid')
  if (!lid) return NextResponse.json({ status: 'unknown' })

  const { data } = await supabase
    .from('customers')
    .select('subscription_status')
    .eq('line_user_id', lid)
    .single()

  return NextResponse.json({ status: data?.subscription_status ?? 'pending' })
}
