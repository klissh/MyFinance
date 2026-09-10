"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useMoney } from "@/lib/currency"
import {
  kamarService,
  accountService,
  type KamarMemberRecord,
  type FinancialAccountRecord,
  type RoomItemInput,
} from "@/lib/db"
import {
  scanReceipt,
  resultToRows,
  totalFromResult,
  emptyRow,
  computeOwed,
  round2,
  type ReviewRow,
  type ScanResult,
} from "@/lib/scan-struk"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Card, CardDescription, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Spinner } from "@/components/ui/spinner"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  ArrowLeft,
  CheckCircle2,
  ScanLine,
  Plus,
  Trash2,
  Users,
  AlertTriangle,
} from "lucide-react"

const CATEGORIES = [
  { value: "Konsumsi Kos", label: "Konsumsi Bersama" },
  { value: "Kebersihan Kos", label: "Galon & Kebersihan" },
  { value: "Utilitas Kos", label: "Listrik & Wifi" },
  { value: "Dapur Kos", label: "Gas & Dapur" },
]

/**
 * Kolom nominal yang menghormati mata uang aktif (RM cents-entry / Rp digit).
 * String tampilan dikelola lokal; `value` numerik hanya berubah lewat onChange
 * kolom ini sendiri, jadi tak perlu efek sinkronisasi.
 */
function MoneyCell({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number
  onChange: (n: number) => void
  className?: string
  placeholder?: string
}) {
  const { formatValue, formatInput, parseInput } = useMoney()
  const [str, setStr] = useState(() => (value ? formatValue(value) : ""))
  return (
    <Input
      type="text"
      inputMode="numeric"
      placeholder={placeholder ?? "0"}
      className={className}
      value={str}
      onChange={(e) => {
        const f = formatInput(e.target.value)
        setStr(f)
        onChange(parseInput(f) || 0)
      }}
    />
  )
}

export default function ScanStrukPage() {
  const router = useRouter()
  const { fmt, symbol } = useMoney()

  const [members, setMembers] = useState<KamarMemberRecord[]>([])
  const [accounts, setAccounts] = useState<FinancialAccountRecord[]>([])
  const [loading, setLoading] = useState(true)

  // Info transaksi
  const [title, setTitle] = useState("")
  const [category, setCategory] = useState("Konsumsi Kos")
  const [totalStruk, setTotalStruk] = useState(0)
  const [paidById, setPaidById] = useState("")
  const [payerAccount, setPayerAccount] = useState("")
  const [defaultGroup, setDefaultGroup] = useState<string[]>([])

  // Item + pembagian
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [assignments, setAssignments] = useState<Record<string, string[]>>({})
  const [checked, setChecked] = useState<Set<string>>(new Set())

  // Scan state
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanErr, setScanErr] = useState<string | null>(null)
  const [scanInfo, setScanInfo] = useState<string | null>(null)
  const [scanSeed, setScanSeed] = useState(0) // remount MoneyCell "total" saat scan mengisi total

  // Assign dialog
  const [assignOpen, setAssignOpen] = useState(false)
  const [assignPick, setAssignPick] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitErr, setSubmitErr] = useState<string | null>(null)

  const memberKey = (m: KamarMemberRecord) => m.userId || m.id
  const memberName = useCallback(
    (id: string) => members.find((m) => memberKey(m) === id)?.name || "Anggota",
    [members],
  )

  useEffect(() => {
    async function load() {
      const room = kamarService.getUserRoom()
      const [memberList, accList] = await Promise.all([
        kamarService.getRoomMembers(room?.id),
        accountService.getAll(),
      ])
      setMembers(memberList)
      setAccounts(accList)
      const me = memberList.find((m) => m.isMe)?.userId || memberList[0]?.userId || ""
      setPaidById(me)
      setDefaultGroup(memberList.map((m) => m.userId || m.id))
      setPayerAccount(
        accList.find((a) => a.accountCategory === "bank")?.name || accList[0]?.name || "",
      )
      setLoading(false)
    }
    load()
  }, [])

  const payerIsMe = useMemo(
    () => members.find((m) => memberKey(m) === paidById)?.isMe ?? false,
    [members, paidById],
  )

  // ---- item ops ----
  const addRows = useCallback(
    (newRows: ReviewRow[]) => {
      setRows((prev) => [...prev, ...newRows])
      setAssignments((prev) => {
        const next = { ...prev }
        for (const r of newRows) next[r.id] = [...defaultGroup]
        return next
      })
    },
    [defaultGroup],
  )

  const updateRow = (id: string, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))

  const removeRow = (id: string) => {
    setRows((prev) => prev.filter((r) => r.id !== id))
    setAssignments((prev) => {
      const n = { ...prev }
      delete n[id]
      return n
    })
    setChecked((prev) => {
      const n = new Set(prev)
      n.delete(id)
      return n
    })
  }

  const toggleCheck = (id: string) =>
    setChecked((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // Inti: assign satu kelompok ke BANYAK item sekaligus, lalu kosongkan centang.
  const assignGroupToItems = (itemIds: string[], memberIds: string[]) => {
    setAssignments((prev) => {
      const next = { ...prev }
      for (const id of itemIds) next[id] = [...memberIds]
      return next
    })
    setChecked(new Set())
  }

  // ---- scan ----
  const onPickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setScanning(true)
    setScanErr(null)
    setScanInfo(null)
    try {
      const result: ScanResult = await scanReceipt(file)
      const scanned = resultToRows(result)
      if (scanned.length === 0) {
        setScanErr(
          "Tidak ada baris item terbaca dari struk. Coba foto lebih jelas/terang, atau tambah item manual.",
        )
      } else {
        addRows(scanned)
        const t = totalFromResult(result)
        if (t && totalStruk === 0) {
          setTotalStruk(t)
          setScanSeed((s) => s + 1)
        }
        const w = result.warnings?.length ? ` · ${result.warnings.join(" ")}` : ""
        setScanInfo(
          `${scanned.length} item terbaca dalam ${result.timing.total_s}s (OCR ${result.timing.ocr_s}s).${w}`,
        )
      }
    } catch (err) {
      setScanErr(err instanceof Error ? err.message : "Scan gagal.")
    } finally {
      setScanning(false)
    }
  }

  // ---- perhitungan preview ----
  const { owed, participants, itemsSum, diff } = useMemo(
    () => computeOwed(rows, assignments, totalStruk),
    [rows, assignments, totalStruk],
  )

  const unassignedCount = rows.filter((r) => !(assignments[r.id]?.length)).length
  const canSubmit =
    !!title.trim() &&
    totalStruk > 0 &&
    rows.length > 0 &&
    unassignedCount === 0 &&
    !!paidById &&
    !submitting

  const handleSubmit = async () => {
    if (!canSubmit) return
    setSubmitting(true)
    setSubmitErr(null)
    const items: RoomItemInput[] = rows.map((r) => ({
      itemName: r.nama.trim() || "(tanpa nama)",
      quantity: r.qty > 0 ? r.qty : 1,
      unitPrice: r.hargaSatuan,
      itemTotal: Math.max(0, round2(r.subtotal)),
      source: r.source,
      memberIds: assignments[r.id] || [],
    }))
    const { error } = await kamarService.addSharedTransactionWithItems({
      title: title.trim(),
      category,
      totalAmount: round2(totalStruk),
      paidByUserId: paidById,
      items,
      payerAccount: payerIsMe ? payerAccount : undefined,
    })
    setSubmitting(false)
    if (error) {
      setSubmitErr(error)
      return
    }
    router.push("/kamar/kos?scan=ok")
  }

  const groupBadge = (id: string) => {
    const g = assignments[id] || []
    if (g.length === 0)
      return (
        <Badge className="border-none bg-rose-500/15 px-1.5 py-0 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
          Belum dibagi
        </Badge>
      )
    if (g.length === members.length)
      return (
        <Badge variant="outline" className="border-border px-1.5 py-0 text-[10px] font-normal">
          Semua ({g.length})
        </Badge>
      )
    return (
      <Badge variant="outline" className="border-border px-1.5 py-0 text-[10px] font-normal">
        {g.length} orang
      </Badge>
    )
  }

  const toggleInList = (list: string[], id: string, min = 0) =>
    list.includes(id)
      ? list.length > min
        ? list.filter((x) => x !== id)
        : list
      : [...list, id]

  return (
    <div className="flex flex-col min-w-0 max-w-full overflow-x-hidden">
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 min-w-0">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
        <Breadcrumb className="truncate">
          <BreadcrumbList>
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink href="/kamar/kos">Split Bill Kos</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:inline-flex" />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-base truncate">Scan Struk / Per Item</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex flex-1 flex-col gap-5 p-4 md:p-6 bg-background min-w-0 max-w-full pb-28">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit -ml-2 text-xs text-muted-foreground"
          onClick={() => router.push("/kamar/kos")}
        >
          <ArrowLeft className="size-4 mr-1" /> Kembali ke Split Bill
        </Button>

        {loading ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Spinner className="mx-auto mb-2 size-5" /> Memuat data kamar…
          </div>
        ) : (
          <>
            {/* 1. Info transaksi */}
            <Card className="border border-border shadow-none p-4 md:p-5 gap-4 bg-card">
              <div>
                <CardTitle className="text-base font-semibold">Info Transaksi</CardTitle>
                <CardDescription className="text-xs">
                  Pilih kelompok default dulu — semua item hasil scan otomatis masuk ke sana.
                </CardDescription>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold text-muted-foreground">Keterangan</label>
                  <Input
                    placeholder="Contoh: Belanja mingguan Lotte Mart"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Kategori</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Total di struk ({symbol})
                  </label>
                  <MoneyCell key={`total-${scanSeed}`} value={totalStruk} onChange={setTotalStruk} />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-muted-foreground">Dibayar / ditalangi oleh</label>
                  <Select value={paidById} onValueChange={setPaidById}>
                    <SelectTrigger className="w-full font-semibold">
                      <SelectValue placeholder="Pilih penalang" />
                    </SelectTrigger>
                    <SelectContent>
                      {members.map((m) => (
                        <SelectItem key={memberKey(m)} value={memberKey(m)}>
                          {m.name} {m.isMe ? "(Saya)" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {payerIsMe && accounts.length > 0 && (
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-muted-foreground">Dibayar pakai akun</label>
                    <Select value={payerAccount} onValueChange={setPayerAccount}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Pilih akun" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.name}>
                            {a.name} ({fmt(a.balance)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">
                  Kelompok default (item baru otomatis dibagi ke sini)
                </label>
                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl border border-border bg-muted/30">
                  {members.map((m) => {
                    const id = memberKey(m)
                    const on = defaultGroup.includes(id)
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setDefaultGroup((prev) => toggleInList(prev, id, 1))}
                        className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                          on
                            ? "bg-primary/10 border-primary/30 text-primary"
                            : "bg-card border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span>
                          {m.name}
                          {m.isMe ? " (Saya)" : ""}
                        </span>
                        {on && <CheckCircle2 className="size-3.5 text-primary" />}
                      </button>
                    )
                  })}
                </div>
              </div>
            </Card>

            {/* 2. Item */}
            <Card className="border border-border shadow-none p-4 md:p-5 gap-4 bg-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base font-semibold">Item ({rows.length})</CardTitle>
                  <CardDescription className="text-xs">
                    Centang item pengecualian → &quot;Bagi ke…&quot; untuk beri kelompok berbeda.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPickFile} />
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs shadow-none"
                    disabled={scanning}
                    onClick={() => fileRef.current?.click()}
                  >
                    {scanning ? <Spinner className="size-3.5 mr-1.5" /> : <ScanLine className="size-4 mr-1.5" />}
                    {scanning ? "Memindai…" : "Scan Struk"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs shadow-none"
                    onClick={() => addRows([emptyRow()])}
                  >
                    <Plus className="size-4 mr-1" /> Item
                  </Button>
                </div>
              </div>

              {scanning && (
                <div className="rounded-xl border border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  Memindai struk… biasanya 15–30 detik. Kalau server sedang idle, request pertama bisa
                  sampai ~1 menit. Jangan tutup halaman.
                </div>
              )}
              {scanErr && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>{scanErr}</span>
                </div>
              )}
              {scanInfo && (
                <div className="flex items-start gap-2 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{scanInfo}</span>
                </div>
              )}

              {rows.length === 0 ? (
                <div className="py-10 text-center text-xs text-muted-foreground">
                  Belum ada item. Scan struk atau tambah manual.
                </div>
              ) : (
                <div className="space-y-2">
                  {rows.map((r) => {
                    const isChecked = checked.has(r.id)
                    return (
                      <div
                        key={r.id}
                        className={`rounded-xl border p-2.5 transition-colors ${
                          isChecked ? "border-primary/40 bg-primary/5" : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          <button
                            type="button"
                            onClick={() => toggleCheck(r.id)}
                            aria-label="pilih item"
                            className={`mt-0.5 size-4 shrink-0 rounded border flex items-center justify-center ${
                              isChecked ? "bg-primary border-primary text-primary-foreground" : "border-input"
                            }`}
                          >
                            {isChecked && <CheckCircle2 className="size-3" />}
                          </button>

                          <div className="min-w-0 flex-1 space-y-2">
                            <Input
                              value={r.nama}
                              onChange={(e) => updateRow(r.id, { nama: e.target.value })}
                              placeholder="Nama barang"
                              className="h-8 text-xs font-medium"
                            />
                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <span className="block text-[10px] text-muted-foreground">Qty</span>
                                <Input
                                  type="text"
                                  inputMode="decimal"
                                  value={String(r.qty)}
                                  onChange={(e) =>
                                    updateRow(r.id, {
                                      qty: Math.max(0, parseFloat(e.target.value.replace(/[^\d.]/g, "")) || 0),
                                    })
                                  }
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] text-muted-foreground">Harga satuan</span>
                                <MoneyCell
                                  value={r.hargaSatuan ?? 0}
                                  placeholder="—"
                                  onChange={(n) => updateRow(r.id, { hargaSatuan: n || null })}
                                  className="h-8 text-xs"
                                />
                              </div>
                              <div>
                                <span className="block text-[10px] text-muted-foreground">Subtotal</span>
                                <MoneyCell
                                  value={r.subtotal}
                                  onChange={(n) => updateRow(r.id, { subtotal: n })}
                                  className="h-8 text-xs font-semibold"
                                />
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                {groupBadge(r.id)}
                                {(assignments[r.id]?.length ?? 0) > 0 &&
                                  (assignments[r.id]?.length ?? 0) < members.length && (
                                    <span className="truncate text-[10px] text-muted-foreground">
                                      {(assignments[r.id] || []).map(memberName).join(", ")}
                                    </span>
                                  )}
                              </div>
                              <button
                                type="button"
                                onClick={() => removeRow(r.id)}
                                className="text-muted-foreground hover:text-rose-600"
                                aria-label="hapus item"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </Card>

            {/* 3. Ringkasan per anggota */}
            <Card className="border border-border shadow-none p-4 md:p-5 gap-3 bg-card">
              <CardTitle className="text-base font-semibold">Ringkasan per Anggota</CardTitle>
              <div className="space-y-1.5 text-xs">
                {members
                  .filter((m) => (owed[memberKey(m)] ?? 0) !== 0 || participants.includes(memberKey(m)))
                  .map((m) => (
                    <div key={memberKey(m)} className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {m.name}
                        {m.isMe ? " (Saya)" : ""}
                        {memberKey(m) === paidById ? " · penalang" : ""}
                      </span>
                      <span className="font-semibold text-foreground">{fmt(owed[memberKey(m)] ?? 0)}</span>
                    </div>
                  ))}
                {participants.length === 0 && (
                  <div className="text-muted-foreground">Belum ada item yang dibagi.</div>
                )}
              </div>
              <Separator />
              <div className="space-y-1 text-[11px] text-muted-foreground">
                <div className="flex justify-between">
                  <span>Jumlah semua item</span>
                  <span>{fmt(itemsSum)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total di struk</span>
                  <span>{fmt(totalStruk)}</span>
                </div>
                <div className="flex justify-between">
                  <span>
                    Selisih (pajak / diskon / pembulatan){" "}
                    {participants.length > 0 && diff !== 0 ? `— dibagi rata ${participants.length} peserta` : ""}
                  </span>
                  <span className={diff !== 0 ? "text-amber-600 dark:text-amber-400" : ""}>{fmt(diff)}</span>
                </div>
              </div>
            </Card>

            {submitErr && (
              <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-xs text-rose-600 dark:text-rose-400">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>{submitErr}</span>
              </div>
            )}
          </>
        )}
      </div>

      {/* Bottom bar: aksi "Bagi ke…" saat ada item tercentang, atau tombol Simpan */}
      {!loading && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:pl-[calc(var(--sidebar-width)+1rem)]">
          {checked.size > 0 ? (
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <span className="text-xs font-medium text-muted-foreground">{checked.size} item dipilih</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setChecked(new Set())}>
                  Batal
                </Button>
                <Button
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    const ids = [...checked]
                    const first = ids[0]
                    setAssignPick([...(assignments[first] || defaultGroup)])
                    setAssignOpen(true)
                  }}
                >
                  <Users className="size-4 mr-1.5" /> Bagi ke…
                </Button>
              </div>
            </div>
          ) : (
            <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">
                {unassignedCount > 0
                  ? `${unassignedCount} item belum dibagi`
                  : rows.length > 0
                    ? "Semua item sudah dibagi"
                    : "Tambah item dulu"}
              </span>
              <Button size="sm" className="text-xs" disabled={!canSubmit} onClick={handleSubmit}>
                {submitting ? <Spinner className="size-3.5 mr-1.5" /> : null}
                Simpan Split Bill
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Dialog: pilih kelompok untuk item tercentang */}
      <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
        <DialogContent className="sm:max-w-sm shadow-none border">
          <DialogHeader>
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <Users className="size-5 text-primary" /> Bagi {checked.size} item ke…
            </DialogTitle>
            <DialogDescription className="text-xs">
              Kelompok ini akan menggantikan pembagian untuk semua item yang dicentang.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1">
            <button
              type="button"
              onClick={() => setAssignPick(members.map((m) => memberKey(m)))}
              className="text-[11px] font-medium text-primary hover:underline"
            >
              Pilih semua anggota kos ({members.length})
            </button>
            <div className="grid grid-cols-2 gap-2">
              {members.map((m) => {
                const id = memberKey(m)
                const on = assignPick.includes(id)
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAssignPick((prev) => toggleInList(prev, id))}
                    className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-between border transition-all ${
                      on
                        ? "bg-primary/10 border-primary/30 text-primary"
                        : "bg-card border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span>
                      {m.name}
                      {m.isMe ? " (Saya)" : ""}
                    </span>
                    {on && <CheckCircle2 className="size-3.5 text-primary" />}
                  </button>
                )
              })}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" className="text-xs" onClick={() => setAssignOpen(false)}>
              Batal
            </Button>
            <Button
              size="sm"
              className="text-xs"
              disabled={assignPick.length === 0}
              onClick={() => {
                assignGroupToItems([...checked], assignPick)
                setAssignOpen(false)
              }}
            >
              Terapkan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
