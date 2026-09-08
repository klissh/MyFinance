import { createBrowserClient } from "@supabase/ssr"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    !supabaseUrl.includes("your-project"),
)

/**
 * Browser Supabase client (session disimpan di cookie via @supabase/ssr).
 * Cookie inilah yang dibaca oleh `proxy.ts` untuk verifikasi sesi asli di server.
 */
export const supabase = isSupabaseConfigured
  ? createBrowserClient(supabaseUrl, supabaseAnonKey)
  : null
