// Klien untuk fitur scan struk. Memanggil /api/scan-struk (proxy server-side ke
// layanan Modal OCR + LayoutLMv3). Lihat inference/modal_app.py untuk kontraknya.

export interface ScanWord {
  text: string
  box: [number, number, number, number] // dinormalisasi 0..1000
  label: string // kategori CORD tanpa prefix BIO, mis. "menu.nm", "total.total_price", "O"
  bio: string
  ocr_conf: number
}

export interface ScanItem {
  nama: string | null
  qty: string | null
  harga_satuan: string | null
  subtotal: string | null
  diskon_item: string | null
  qty_value: number | null
  harga_satuan_value: number | null
  subtotal_value: number | null
}

export interface ScanSummaryEntry {
  text: string
  value: number | null
}

export interface ScanResult {
  status: "done"
  timing: { ocr_s: number; layoutlm_s: number; total_s: number }
  image: { w: number; h: number; downscaled_from: [number, number] | null; ocr_words: number }
  raw_words: ScanWord[]
  items: ScanItem[]
  ringkasan: Record<string, ScanSummaryEntry | null> | null
  warnings: string[]
}

export interface ScanError {
  error: string
}

/** Kirim gambar struk ke layanan. Melempar Error dengan pesan siap-tampil. */
export async function scanReceipt(file: File): Promise<ScanResult> {
  const form = new FormData()
  form.append("file", file)

  let res: Response
  try {
    res = await fetch("/api/scan-struk", { method: "POST", body: form })
  } catch {
    throw new Error("Gagal menghubungi server. Cek koneksi internet.")
  }

  let body: ScanResult | ScanError
  try {
    body = await res.json()
  } catch {
    throw new Error("Respons server tidak valid.")
  }

  if (!res.ok || "error" in body) {
    throw new Error(("error" in body && body.error) || `Scan gagal (${res.status}).`)
  }
  return body
}

/** Baris item untuk layar review (semua nilai uang = angka bulat). */
export interface ReviewRow {
  id: string
  nama: string
  qty: number
  hargaSatuan: number | null
  subtotal: number
  source: "scan" | "manual"
}

let _rowSeq = 0
function rowId(): string {
  _rowSeq += 1
  return `row-${Date.now().toString(36)}-${_rowSeq}`
}

export function resultToRows(result: ScanResult): ReviewRow[] {
  return result.items
    .filter((it) => it.nama || it.subtotal_value || it.harga_satuan_value)
    .map((it) => {
      const sub =
        it.subtotal_value ??
        (it.harga_satuan_value != null && it.qty_value != null
          ? it.harga_satuan_value * it.qty_value
          : it.harga_satuan_value ?? 0)
      return {
        id: rowId(),
        nama: (it.nama || "(tanpa nama)").trim(),
        qty: it.qty_value && it.qty_value > 0 ? it.qty_value : 1,
        hargaSatuan: it.harga_satuan_value ?? null,
        subtotal: Math.max(0, round2(sub || 0)),
        source: "scan" as const,
      }
    })
}

/** Total dari ringkasan hasil scan (dipakai untuk auto-isi "Total struk"). */
export function totalFromResult(result: ScanResult): number | null {
  const t = result.ringkasan?.total
  return t && t.value != null && t.value > 0 ? round2(t.value) : null
}

export function emptyRow(): ReviewRow {
  return { id: rowId(), nama: "", qty: 1, hargaSatuan: null, subtotal: 0, source: "manual" }
}

export function newRowId(): string {
  return rowId()
}

/** Bulatkan ke 2 desimal (cocok untuk RM & Rp; RPC server pakai round(x,2) juga). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * Hitung tanggungan per anggota — HARUS cocok dengan RPC
 * `create_room_transaction_with_items` (untuk preview real-time di layar review).
 * Selisih (total struk - jumlah item) dibagi RATA ke peserta struk.
 */
export function computeOwed(
  rows: { id: string; subtotal: number }[],
  assignments: Record<string, string[]>,
  totalStruk: number,
): { owed: Record<string, number>; participants: string[]; itemsSum: number; diff: number } {
  const owed: Record<string, number> = {}
  const participantSet = new Set<string>()
  let itemsSum = 0
  for (const r of rows) {
    itemsSum += r.subtotal
    const members = assignments[r.id] || []
    if (!members.length) continue
    const per = r.subtotal / members.length
    for (const m of members) {
      owed[m] = (owed[m] || 0) + per
      participantSet.add(m)
    }
  }
  const participants = [...participantSet]
  const diff = round2(totalStruk - itemsSum)
  if (participants.length && diff !== 0) {
    const d = diff / participants.length
    for (const p of participants) owed[p] = (owed[p] || 0) + d
  }
  for (const k of Object.keys(owed)) owed[k] = round2(owed[k])
  return { owed, participants, itemsSum: round2(itemsSum), diff }
}
