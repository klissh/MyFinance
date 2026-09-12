import { describe, expect, it } from "vitest"
import { computeOwed, round2, resultToRows, totalFromResult, type ScanResult, type ScanItem } from "./scan-struk"

function item(overrides: Partial<ScanItem> = {}): ScanItem {
  return {
    nama: null,
    qty: null,
    harga_satuan: null,
    subtotal: null,
    diskon_item: null,
    qty_value: null,
    harga_satuan_value: null,
    subtotal_value: null,
    ...overrides,
  }
}

describe("round2", () => {
  it("membulatkan ke 2 desimal (aman untuk RM & Rp)", () => {
    expect(round2(12.005)).toBeCloseTo(12.01, 2)
    expect(round2(100000)).toBe(100000)
    expect(round2(6.666666)).toBe(6.67)
  })
})

describe("computeOwed", () => {
  // Skenario yang sama dengan yang diverifikasi lewat RPC create_room_transaction_with_items
  // (lihat migrasi add_room_transaction_items_split_per_item): total struk 100.000,
  // Lauk 60.000 dibagi 2 orang, Beras 30.000 ditanggung 1 orang saja.
  const rows = [
    { id: "lauk", subtotal: 60000 },
    { id: "beras", subtotal: 30000 },
  ]
  const assignments = {
    lauk: ["cuklis", "nopal"],
    beras: ["cuklis"],
  }

  it("membagi tiap item rata ke anggotanya, lalu selisih rata ke SEMUA peserta", () => {
    const { owed, participants, itemsSum, diff } = computeOwed(rows, assignments, 100000)
    expect(itemsSum).toBe(90000)
    expect(diff).toBe(10000) // 100.000 - 90.000
    expect(participants.sort()).toEqual(["cuklis", "nopal"])
    // cuklis: 30.000 (lauk) + 30.000 (beras) + 5.000 (separuh selisih) = 65.000
    // nopal : 30.000 (lauk) + 5.000 (separuh selisih) = 35.000
    expect(owed.cuklis).toBe(65000)
    expect(owed.nopal).toBe(35000)
    expect(owed.cuklis + owed.nopal).toBe(100000)
  })

  it("item tanpa penanggung tidak ikut dihitung ke siapa pun", () => {
    const { owed, participants } = computeOwed(
      [{ id: "a", subtotal: 10000 }],
      {}, // belum ada yang di-assign
      10000,
    )
    expect(participants).toEqual([])
    expect(owed).toEqual({})
  })

  it("tidak ada selisih kalau total struk == jumlah semua item", () => {
    const { diff, owed } = computeOwed(
      [{ id: "a", subtotal: 50000 }],
      { a: ["cuklis"] },
      50000,
    )
    expect(diff).toBe(0)
    expect(owed.cuklis).toBe(50000)
  })
})

describe("resultToRows / totalFromResult", () => {
  function makeResult(overrides: Partial<ScanResult> = {}): ScanResult {
    return {
      status: "done",
      timing: { ocr_s: 1, layoutlm_s: 1, total_s: 2 },
      image: { w: 800, h: 600, downscaled_from: null, ocr_words: 0 },
      raw_words: [],
      items: [],
      ringkasan: null,
      warnings: [],
      ...overrides,
    }
  }

  it("mengambil subtotal_value kalau ada", () => {
    const result = makeResult({
      items: [item({ nama: "Indomie Goreng", subtotal_value: 10500 })],
    })
    const rows = resultToRows(result)
    expect(rows).toHaveLength(1)
    expect(rows[0].nama).toBe("Indomie Goreng")
    expect(rows[0].subtotal).toBe(10500)
    expect(rows[0].source).toBe("scan")
  })

  it("jatuh ke harga_satuan * qty kalau subtotal_value kosong", () => {
    const result = makeResult({
      items: [item({ nama: "Telur", harga_satuan_value: 2000, qty_value: 3 })],
    })
    expect(resultToRows(result)[0].subtotal).toBe(6000)
  })

  it("baris tanpa nama/harga sama sekali dibuang", () => {
    const result = makeResult({ items: [item(), item({ nama: "Ada Nama" })] })
    expect(resultToRows(result)).toHaveLength(1)
  })

  it("totalFromResult ambil dari ringkasan.total kalau > 0", () => {
    const result = makeResult({ ringkasan: { total: { text: "123.200", value: 123200 } } })
    expect(totalFromResult(result)).toBe(123200)
  })

  it("totalFromResult null kalau ringkasan tidak ada / total 0", () => {
    expect(totalFromResult(makeResult())).toBeNull()
    expect(totalFromResult(makeResult({ ringkasan: { total: { text: "0", value: 0 } } }))).toBeNull()
  })

  it("subtotal item RM dengan sen tidak dibulatkan jadi bulat (dulu bug: Math.round buang sen)", () => {
    const result = makeResult({
      items: [item({ nama: "Freshest B", subtotal_value: 2.39 })],
    })
    expect(resultToRows(result)[0].subtotal).toBe(2.39)
  })

  it("totalFromResult RM dengan sen tetap 2 desimal, bukan dibulatkan ke Ringgit bulat", () => {
    const result = makeResult({ ringkasan: { total: { text: "15.25", value: 15.25 } } })
    expect(totalFromResult(result)).toBe(15.25)
  })
})
