import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

// Proxy ke layanan inferensi scan struk (Modal). API key disimpan server-side —
// tidak pernah sampai ke browser. Hanya user login yang boleh memanggil.
export const runtime = "nodejs"
export const maxDuration = 60 // detik — OCR + LayoutLMv3 bisa 15-40s (cold start lebih)

const SERVICE_URL = process.env.SCAN_STRUK_URL
const SERVICE_KEY = process.env.SCAN_STRUK_API_KEY

export async function POST(request: Request) {
  if (!SERVICE_URL || !SERVICE_KEY) {
    return NextResponse.json(
      { error: "Layanan scan struk belum dikonfigurasi (SCAN_STRUK_URL / SCAN_STRUK_API_KEY)." },
      { status: 503 },
    )
  }

  // Wajib login.
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Harus login." }, { status: 401 })
    }
  } catch {
    return NextResponse.json({ error: "Sesi tidak valid." }, { status: 401 })
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return NextResponse.json({ error: "Body harus multipart/form-data." }, { status: 400 })
  }
  const file = form.get("file")
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Field 'file' (gambar) wajib." }, { status: 400 })
  }
  if (file.size > 15 * 1024 * 1024) {
    return NextResponse.json({ error: "Gambar terlalu besar (maks 15 MB)." }, { status: 413 })
  }

  const upstream = new FormData()
  upstream.append("file", file, file.name || "struk.jpg")

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 55_000)
  try {
    const res = await fetch(`${SERVICE_URL.replace(/\/$/, "")}/scan`, {
      method: "POST",
      headers: { "X-API-Key": SERVICE_KEY },
      body: upstream,
      signal: controller.signal,
    })
    const text = await res.text()
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      json = { error: "Respons layanan tidak valid.", raw: text.slice(0, 500) }
    }
    return NextResponse.json(json, { status: res.ok ? 200 : res.status })
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError"
    return NextResponse.json(
      {
        error: aborted
          ? "Layanan scan lama merespons (mungkin sedang dingin/idle). Coba lagi dalam ~1 menit, atau input manual."
          : "Tidak bisa menghubungi layanan scan struk.",
      },
      { status: 504 },
    )
  } finally {
    clearTimeout(timer)
  }
}
