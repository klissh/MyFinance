import { describe, expect, it } from "vitest"
import {
  resolvePersonalAccount,
  isSystemTransaction,
  stripLedgerRef,
  maskCardNumber,
  localId,
  todayLocalISO,
  toISODate,
  formatIdDate,
  type FinancialAccountRecord,
} from "./db"

function makeAccount(overrides: Partial<FinancialAccountRecord> = {}): FinancialAccountRecord {
  return {
    id: "ACC-1",
    name: "Tunai",
    type: "cash",
    accountCategory: "cash",
    balance: 0,
    cardNumber: "**** **** 0000",
    cardHolder: "USER",
    expiration: "12/29",
    cardDesignType: "brand-dark",
    cardNetwork: "mastercard",
    ...overrides,
  }
}

describe("resolvePersonalAccount", () => {
  it("pakai preferred kalau ada di daftar akun", () => {
    const accounts = [makeAccount({ name: "Bank BCA", accountCategory: "bank" }), makeAccount({ name: "GoPay", accountCategory: "ewallet" })]
    expect(resolvePersonalAccount(accounts, "GoPay")).toBe("GoPay")
  })

  it("abaikan preferred kalau tidak ada di daftar akun, jatuh ke akun bank pertama", () => {
    const accounts = [
      makeAccount({ name: "Tunai", accountCategory: "cash" }),
      makeAccount({ name: "Bank Mandiri", accountCategory: "bank" }),
    ]
    expect(resolvePersonalAccount(accounts, "Akun Tak Ada")).toBe("Bank Mandiri")
  })

  it("jatuh ke akun apa pun kalau tidak ada akun bank", () => {
    const accounts = [makeAccount({ name: "GoPay", accountCategory: "ewallet" })]
    expect(resolvePersonalAccount(accounts)).toBe("GoPay")
  })

  it("jatuh ke 'Bank BCA' kalau tidak ada akun sama sekali", () => {
    expect(resolvePersonalAccount([])).toBe("Bank BCA")
  })
})

describe("isSystemTransaction / stripLedgerRef", () => {
  it("mengenali penanda split bill [#sbS:...]", () => {
    const notes = 'Bagian saya dari tagihan bersama "Beli galon" [#sbS:abc123]'
    expect(isSystemTransaction(notes)).toBe(true)
    expect(stripLedgerRef(notes)).toBe('Bagian saya dari tagihan bersama "Beli galon"')
  })

  it("mengenali penanda auto-log [#auto]", () => {
    const notes = "Setoran otomatis ke target Liburan [#auto]"
    expect(isSystemTransaction(notes)).toBe(true)
    expect(stripLedgerRef(notes)).toBe("Setoran otomatis ke target Liburan")
  })

  it("transaksi manual biasa BUKAN system transaction", () => {
    expect(isSystemTransaction("Beli baju baru")).toBe(false)
    expect(isSystemTransaction(undefined)).toBe(false)
    expect(isSystemTransaction(null)).toBe(false)
  })

  it("stripLedgerRef aman untuk notes kosong/null & teks tanpa penanda", () => {
    expect(stripLedgerRef(null)).toBe("")
    expect(stripLedgerRef(undefined)).toBe("")
    expect(stripLedgerRef("Tidak ada penanda apa pun")).toBe("Tidak ada penanda apa pun")
  })

  it("penanda model lama (sbP/sbO/sbB) juga ikut ter-strip", () => {
    expect(isSystemTransaction("Talangan kos [#sbP:xyz789]")).toBe(true)
    expect(stripLedgerRef("Talangan kos [#sbP:xyz789]")).toBe("Talangan kos")
  })
})

describe("maskCardNumber", () => {
  it("memaskir nomor kartu asli (>=12 digit berurutan) jadi 4 digit terakhir", () => {
    expect(maskCardNumber("4532015112830366")).toBe("**** **** **** 0366")
    expect(maskCardNumber("4532 0151 1283 0366")).toBe("**** **** **** 0366")
    expect(maskCardNumber("4532-0151-1283-0366")).toBe("**** **** **** 0366")
  })

  it("membiarkan pola contoh/parsial (< 12 digit) apa adanya", () => {
    expect(maskCardNumber("**** **** 8829")).toBe("**** **** 8829")
    expect(maskCardNumber("1234")).toBe("1234")
    expect(maskCardNumber("")).toBe("")
  })
})

describe("localId", () => {
  it("diawali prefix yang diminta", () => {
    expect(localId("ACC")).toMatch(/^ACC-/)
    expect(localId("TX")).toMatch(/^TX-/)
  })

  it("tidak pernah menghasilkan id yang sama dua kali berturutan", () => {
    const ids = new Set(Array.from({ length: 200 }, () => localId("X")))
    expect(ids.size).toBe(200)
  })
})

describe("todayLocalISO / toISODate / formatIdDate", () => {
  it("todayLocalISO format YYYY-MM-DD, pakai waktu LOKAL bukan UTC", () => {
    // 2026-01-05 23:30 waktu lokal -> tetap tanggal 5, bukan mundur/maju ke UTC
    const d = new Date(2026, 0, 5, 23, 30)
    expect(todayLocalISO(d)).toBe("2026-01-05")
  })

  it("toISODate mem-parse tanggal bebas -> YYYY-MM-DD", () => {
    expect(toISODate("2026-03-10")).toBe("2026-03-10")
  })

  it("toISODate jatuh ke hari ini kalau input tak bisa diparse", () => {
    expect(toISODate("bukan tanggal")).toBe(todayLocalISO())
  })

  it("formatIdDate menghasilkan format Indonesia 'dd MMM yyyy'", () => {
    expect(formatIdDate("2026-08-17")).toMatch(/17.*2026/)
  })

  it("formatIdDate mengembalikan '-' untuk input tak valid", () => {
    expect(formatIdDate("bukan tanggal")).toBe("-")
  })
})
