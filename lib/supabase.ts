import { createClient, SupabaseClient } from '@supabase/supabase-js'

// サーバーサイド専用（service_role キー）
// ビルド時は呼ばれないよう遅延初期化
let _client: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url) throw new Error('Missing SUPABASE_URL')
    if (!key) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY')
    _client = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
  }
  return _client
}

// 後方互換のエイリアス（既存コードはそのまま動く）
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (getSupabase() as any)[prop]
  },
})
