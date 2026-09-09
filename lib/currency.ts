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

/** Format nominal → "RM 1,250.50" / "Rp 1.250". Desimal hanya muncul bila ada. */
export function formatMoney(amount: number, c: Currency = getCurrency()): string {
  const { symbol, locale, maxDecimals } = CONFIG[c]
  const n = Number.isFinite(amount) ? amount : 0
  return `${symbol} ${n.toLocaleString(locale, {
    minimumFractionDigits: 0,
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
 * Format teks yang diketik user di kolom nominal.
 *  IDR → hanya digit, ribuan pakai titik ("1.250.000")
 *  MYR → boleh 1 titik desimal (maks 2 angka), ribuan pakai koma ("1,250.50")
 */
export function formatAmountInput(raw: string, c: Currency = getCurrency()): string {
  if (c === "IDR") {
    const digits = raw.replace(/\D/g, "")
    return digits ? Number(digits).toLocaleString("id-ID") : ""
  }
  let s = raw.replace(/[^\d.]/g, "")
  const firstDot = s.indexOf(".")
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "")
  }
  const [intPart, decPart] = s.split(".")
  const intFmt = intPart ? Number(intPart).toLocaleString("en-US") : ""
  if (decPart === undefined) return intFmt
  return `${intFmt || "0"}.${decPart.slice(0, 2)}`
}

/** Kebalikan `formatAmountInput` → angka. */
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
    parseInput: (formatted: string) => parseAmountInput(formatted, currency),
    setCurrency,
  }
}
