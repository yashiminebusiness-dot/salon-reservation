import { NextRequest, NextResponse } from 'next/server'
import { authenticate } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const auth = await authenticate(req)
  if ('error' in auth) return auth.error

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('customer_id', auth.customer.id)
    .order('start_at', { ascending: false })
    .limit(20)

  if (error) return NextResponse.json({ error: 'Database error' }, { status: 500 })

  return NextResponse.json({ bookings })
}
