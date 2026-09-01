import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if session token or user cookie exists
  const hasUserSession = request.cookies.has("myfinance_session") || request.cookies.has("sb-access-token")

  const isAuthRoute = pathname.startsWith("/login") || pathname.startsWith("/signup")
  const isProtectedRoute =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/transaksi") ||
    pathname.startsWith("/goals") ||
    pathname.startsWith("/kamar") ||
    pathname.startsWith("/scheduled") ||
    pathname.startsWith("/finance") ||
    pathname.startsWith("/kurs")

  // Redirect unauthenticated users away from protected pages to /login
  if (isProtectedRoute && !hasUserSession) {
    const loginUrl = new URL("/login", request.url)
    return NextResponse.redirect(loginUrl)
  }

  // Redirect authenticated users away from /login or /signup to /dashboard
  if (isAuthRoute && hasUserSession) {
    const dashboardUrl = new URL("/dashboard", request.url)
    return NextResponse.redirect(dashboardUrl)
  }

  return NextResponse.next()
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
