import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

// Rute yang butuh login
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/transaksi",
  "/goals",
  "/kamar",
  "/scheduled",
  "/finance",
  "/kurs",
]

// Rute auth: kalau sudah login, jangan biarkan buka halaman ini lagi
const AUTH_PREFIXES = ["/login", "/signup"]

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Supabase belum dikonfigurasi → mode lokal, jangan blokir rute apa pun.
  if (!supabaseUrl || !supabaseAnonKey) {
    return response
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        )
      },
    },
  })

  // Verifikasi sesi Supabase yang SEBENARNYA (bukan sekadar cek keberadaan cookie).
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p))
  const isAuthRoute = AUTH_PREFIXES.some((p) => pathname.startsWith(p))

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    loginUrl.search = ""
    return NextResponse.redirect(loginUrl)
  }

  if (isAuthRoute && user) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = "/dashboard"
    dashboardUrl.search = ""
    return NextResponse.redirect(dashboardUrl)
  }

  return response
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/transaksi/:path*",
    "/goals/:path*",
    "/kamar/:path*",
    "/scheduled/:path*",
    "/finance/:path*",
    "/kurs/:path*",
    "/login",
    "/signup",
  ],
}
