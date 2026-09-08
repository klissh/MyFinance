import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

/**
 * Supabase client untuk Server Components / Route Handlers.
 * Membaca sesi dari cookie request. Selalu buat instance baru per request.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options)
          })
        } catch {
          // Dipanggil dari Server Component tanpa akses tulis cookie — aman diabaikan,
          // refresh token akan ditangani oleh proxy.ts.
        }
      },
    },
  })
}
