"use client"

import * as React from "react"

export type Currency = "MYR" | "IDR"

const STORAGE_KEY = "myfinance_currency"
const CHANGE_EVENT = "myfinance-currency-changed"

const CONFIG: Record<
  Currency,
  { symbol: string; locale: string; maxDecimals: number; label: string }
> = {
  MYR: { symbol: "RM", locale: "en-US", maxDecimals: 2, label: "Ringgit Malaysia" },
  IDR: { symbol: "Rp", locale: "id-ID", maxDecimals: 0, label: "Rupiah Indonesia" },
}

/** Mata uang aktif (localStorage per-device). Default MYR. */
export function getCurrency(): Currency {
  if (typeof window === "undefined") return "MYR"
  try {
    return localStorage.getItem(STORAGE_KEY) === "IDR" ? "IDR" : "MYR"
  } catch {
    return "MYR"
  }
}

export function setCurrency(c: Currency): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(STORAGE_KEY, c)
  } catch {
    // ignore
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

export function currencySymbol(c: Currency = getCurrency()): string {
  return CONFIG[c].symbol
}

/** Format nominal → "RM 1,250.50" / "Rp 1.250". RM selalu 2 desimal (gaya
 *  Malaysia); Rp tanpa desimal. */
export function formatMoney(amount: number, c: Currency = getCurrency()): string {
  const { symbol, locale, maxDecimals } = CONFIG[c]
  const n = Number.isFinite(amount) ? amount : 0
  return `${symbol} ${n.toLocaleString(locale, {
    minimumFractionDigits: c === "MYR" ? 2 : 0,
    maximumFractionDigits: maxDecimals,
  })}`
}

/** Versi ringkas untuk chip kalender: "RM 1.2k" / "Rp 1,5jt". */
export function formatMoneyShort(amount: number, c: Currency = getCurrency()): string {
  const { symbol } = CONFIG[c]
  const n = Math.abs(amount)
  if (c === "IDR") {
    if (n >= 1_000_000) return `${symbol} ${(amount / 1_000_000).toFixed(1)}jt`
    if (n >= 1_000) return `${symbol} ${Math.round(amount / 1_000)}rb`
    return `${symbol} ${Math.round(amount)}`
  }
  if (n >= 1_000_000) return `${symbol} ${(amount / 1_000_000).toFixed(1)}m`
  if (n >= 1_000) return `${symbol} ${(amount / 1_000).toFixed(1)}k`
  return `${symbol} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
}

/**
 * Format teks yang SEDANG diketik user di kolom nominal (dipanggil tiap keystroke).
 *
 *  IDR → hanya digit, ribuan pakai titik ("1.250.000"). Tanpa sen.
 *  MYR → entri gaya bank/e-wallet Malaysia: user mengetik digit dan 2 angka
 *        paling belakang otomatis jadi sen — titik desimal disisipkan sendiri,
 *        tidak perlu (dan tidak bisa) diketik.
 *          ""       → ""
 *          "1"      → "0.01"
 *          "125"    → "1.25"
 *          "12550"  → "125.50"
 *          "1250000"→ "12,500.00"
 *        Backspace menghapus digit paling kanan (nilai bergeser), persis seperti
 *        Maybank / Touch 'n Go / GXBank.
 */
export function formatAmountInput(raw: string, c: Currency = getCurrency()): string {
  if (c === "IDR") {
    const digits = raw.replace(/\D/g, "")
    return digits ? Number(digits).toLocaleString("id-ID") : ""
  }
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 14)
  if (!digits) return ""
  const value = Number(digits) / 100
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/**
 * Format ANGKA yang sudah diketahui (mis. nilai lama saat membuka dialog "Ubah")
 * menjadi isi kolom input. Beda dari `formatAmountInput` yang memproses ketikan
 * mentah: di sini nilainya sudah pasti, jadi tinggal dirapikan. MYR selalu 2
 * desimal supaya digit-nya tetap konsisten kalau user lanjut mengetik gaya sen
 * ("1,250.50" → digit "125050" → 125050 sen → RM 1.250,50).
 */
export function formatAmountValue(amount: number, c: Currency = getCurrency()): string {
  const n = Number.isFinite(amount) ? amount : 0
  if (c === "IDR") return Math.round(n).toLocaleString("id-ID")
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Kebalikan `formatAmountInput`/`formatAmountValue` → angka. */
export function parseAmountInput(formatted: string, c: Currency = getCurrency()): number {
  if (c === "IDR") return parseInt(formatted.replace(/\D/g, ""), 10) || 0
  const n = parseFloat(formatted.replace(/,/g, ""))
  return Number.isFinite(n) ? n : 0
}

/**
 * Hook reaktif: ikut berubah saat toggle mata uang ditekan (atau di tab lain).
 * `fmt`/`fmtShort`/`formatInput`/`parseInput` sudah terikat ke mata uang aktif.
 */
export function useMoney() {
  const [currency, setCur] = React.useState<Currency>("MYR")

  React.useEffect(() => {
    const sync = () => setCur(getCurrency())
    sync()
    window.addEventListener(CHANGE_EVENT, sync)
    window.addEventListener("storage", sync)
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync)
      window.removeEventListener("storage", sync)
    }
  }, [])

  return {
    currency,
    symbol: CONFIG[currency].symbol,
    label: CONFIG[currency].label,
    fmt: (n: number) => formatMoney(n, currency),
    fmtShort: (n: number) => formatMoneyShort(n, currency),
    formatInput: (raw: string) => formatAmountInput(raw, currency),
    /** Untuk mengisi kolom input dari nilai yang sudah ada (dialog "Ubah"). */
    formatValue: (n: number) => formatAmountValue(n, currency),
    parseInput: (formatted: string) => parseAmountInput(formatted, currency),
    setCurrency,
  }
}
