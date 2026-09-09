"use client"

import { useMoney } from "@/lib/currency"
import React, { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Spinner } from "@/components/ui/spinner"
import {
  Users,
  Copy,
  CheckCircle2,
  ShieldCheck,
  Building2,
  HandCoins,
  Plus,
  Trash2,
  UserMinus,
  LogOut,
} from "lucide-react"
import {
  kamarService,
  KamarRoomRecord,
  KamarMemberRecord,
  DebtSummaryRecord,
} from "@/lib/db"

// Safe Copy Function
const safeCopyText = async (text: string): Promise<boolean> => {
  if (typeof window === "undefined") return false
  if (navigator?.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Ignore & fall back
    }
  }

  try {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    textarea.style.top = "-9999px"
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const successful = document.execCommand("copy")
    document.body.removeChild(textarea)
    return successful
  } catch (err) {
    console.error("Copy fallback failed:", err)
    return false
  }
}

export default function AnggotaKosPage() {
  const { fmt, symbol } = useMoney()
  const router = useRouter()
  const [activeRoom, setActiveRoom] = useState<KamarRoomRecord | null>(null)
  const [members, setMembers] = useState<KamarMemberRecord[]>([])
  const [debtMatrix, setDebtMatrix] = useState<DebtSummaryRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // Delete Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      const room = kamarService.getUserRoom()
      setActiveRoom(room)
      if (room) {
        const [memList, debts] = await Promise.all([
          kamarService.getRoomMembers(room.id),
          kamarService.getDebtSummary(),
        ])
        setMembers(memList)
        setDebtMatrix(debts)
      }
      setIsLoading(false)
    }
    loadData()
  }, [])

  // Posisi utang-piutang bersih per anggota, diturunkan dari matriks utang.
  const memberNet = (name: string): { net: number; status: KamarMemberRecord["status"] } => {
    let net = 0
    for (const d of debtMatrix) {
      if (d.to === name) net += d.amount // orang lain berutang ke dia
      if (d.from === name) net -= d.amount // dia berutang ke orang lain
    }
    const status: KamarMemberRecord["status"] =
      net > 0 ? "is_owed" : net < 0 ? "owes" : "clear"
    return { net, status }
  }

  const inviteCode = activeRoom?.code || "BELUM-ADA"
  const [copiedCode, setCopiedCode] = useState(false)

  // Toast Notification
  const [notification, setNotification] = useState<string | null>(null)
  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  const handleCopyInviteCode = async () => {
    const success = await safeCopyText(inviteCode)
    if (success) {
      setCopiedCode(true)
      showNotification(`Kode undangan "${inviteCode}" berhasil disalin ke clipboard!`)
      setTimeout(() => setCopiedCode(false), 3000)
    } else {
      showNotification(`Kode undangan: ${inviteCode}`)
    }
  }

  const handleDeleteRoom = async () => {
    if (!activeRoom) return
    setIsDeleting(true)
    await kamarService.deleteRoom(activeRoom.id)
    setIsDeleting(false)
    setIsDeleteDialogOpen(false)
    showNotification("Kamar kos berhasil dihapus!")
    setTimeout(() => {
      router.push("/kamar/baru")
    }, 1000)
  }

  const iAmKetua = members.find((m) => m.isMe)?.role === "Ketua Kos"
  const [removingId, setRemovingId] = useState<string | null>(null)
  const [isLeaving, setIsLeaving] = useState(false)

  const reloadMembers = async () => {
    const room = kamarService.getUserRoom()
    if (!room) return
    const [memList, debts] = await Promise.all([
      kamarService.getRoomMembers(room.id),
      kamarService.getDebtSummary(),
    ])
    setMembers(memList)
    setDebtMatrix(debts)
  }

  const handleRemoveMember = async (m: KamarMemberRecord) => {
    setRemovingId(m.id)
    const { error } = await kamarService.removeMember(m.id)
    await reloadMembers()
    setRemovingId(null)
    showNotification(error ? `Gagal: ${error}` : `${m.name} dikeluarkan dari kamar kos.`)
  }

  const handleLeaveRoom = async () => {
    setIsLeaving(true)
    await kamarService.leaveRoom()
    setIsLeaving(false)
    showNotification("Kamu keluar dari kamar kos ini.")
    setTimeout(() => router.push("/kamar/baru"), 1000)
  }

  if (!isLoading && !activeRoom) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 bg-background">
        <Card className="max-w-md w-full p-8 text-center border border-border shadow-none bg-card space-y-4">
          <Users className="size-12 text-muted-foreground mx-auto" />
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold text-foreground">Belum Bergabung ke Kamar Kos</h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Anda belum memiliki atau bergabung dengan kelompok kamar kos manapun. Silakan buat grup kamar kos baru atau masukkan kode undangan dari kawan se-kos Anda.
            </p>
          </div>
          <Button asChild className="w-full text-xs shadow-none">
            <Link href="/kamar/baru">
              <Plus className="size-4 mr-1.5" /> Buat atau Gabung Kamar Kos Sekarang
            </Link>
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col min-w-0 max-w-full overflow-x-hidden">
      {/* Header Bar */}
      <header className="flex min-h-16 shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-2 border-b px-4 py-2 min-w-0 md:h-16 md:flex-nowrap md:py-0">
        <div className="flex items-center gap-2 min-w-0">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb className="truncate">
            <BreadcrumbList>
              <BreadcrumbItem className="hidden sm:inline-flex">
                <BreadcrumbLink href="#">Kamar Kos Bareng</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator className="hidden sm:inline-flex" />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-base truncate">
                  Anggota & Tagihan Saya
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

        {/* Quick Action Button */}
        <Button
          size="sm"
          variant="outline"
          className="shadow-none text-xs border-border shrink-0"
          onClick={handleCopyInviteCode}
        >
          {copiedCode ? (
            <CheckCircle2 className="size-4 sm:mr-1.5 text-emerald-600" />
          ) : (
            <Copy className="size-4 sm:mr-1.5 text-muted-foreground" />
          )}
          <span className="hidden sm:inline">
            {copiedCode ? "Tersalin!" : `Salin Kode: ${inviteCode}`}
          </span>
          <span className="sm:hidden">{copiedCode ? "Tersalin!" : inviteCode}</span>
        </Button>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-w-0 max-w-full">
        {/* Toast Notification Banner */}
        {notification && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-3 text-xs text-foreground shadow-sm animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <span>{notification}</span>
          </div>
        )}

        {/* Room Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-5 rounded-xl border border-border bg-card shadow-none">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-foreground">
                {activeRoom?.name || "Kamar Kos Bersama"}
              </h1>
              <Badge variant="outline" className="text-xs font-normal border-border">
                {members.length} Penghuni
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Daftar anggota kos & ringkasan posisi utang-piutang antar sesama anggota
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="text-xs border-border shadow-none" onClick={handleCopyInviteCode}>
              <Building2 className="size-4 mr-1.5 text-primary" />
              Undang Anggota
            </Button>

            {!iAmKetua && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="outline" className="text-xs shadow-none border-border" disabled={isLeaving}>
                    {isLeaving ? (
                      <span className="flex items-center gap-1.5"><Spinner className="size-3.5" /> Keluar...</span>
                    ) : (
                      <><LogOut className="size-4 mr-1.5" /> Keluar dari Kamar</>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Keluar dari kamar kos ini?</AlertDialogTitle>
                    <AlertDialogDescription className="text-xs leading-relaxed">
                      Kamu akan berhenti jadi anggota &quot;{activeRoom?.name}&quot;. Transaksi
                      split bill & utang-piutang yang belum lunas sebaiknya diselesaikan dulu.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
                    <AlertDialogAction
                      className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                      onClick={handleLeaveRoom}
                    >
                      Ya, Keluar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  size="sm"
                  variant="destructive"
                  className="text-xs shadow-none"
                  disabled={!iAmKetua}
                  title={iAmKetua ? undefined : "Hanya Ketua Kos yang bisa membubarkan kamar"}
                >
                  <Trash2 className="size-4 mr-1.5" /> Hapus Kamar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md shadow-none border">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base font-bold text-rose-600 dark:text-rose-400">
                    <Trash2 className="size-5" />
                    Hapus / Bubarkan Kamar Kos?
                  </DialogTitle>
                  <DialogDescription className="text-xs leading-relaxed">
                    Tindakan ini akan menghapus grup kamar kos <strong className="text-foreground">&quot;{activeRoom?.name}&quot;</strong> dari database dan membatalkan seluruh hubungan anggota kos.
                  </DialogDescription>
                </DialogHeader>

                <DialogFooter className="pt-2">
                  <DialogClose asChild>
                    <Button type="button" variant="outline" className="shadow-none text-xs">
                      Batal
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant="destructive"
                    className="shadow-none text-xs"
                    onClick={handleDeleteRoom}
                    disabled={isDeleting}
                  >
                    {isDeleting ? "Menghapus..." : "Ya, Hapus Kamar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* 2 Columns Section */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Left Column: Members List */}
          <Card className="border border-border shadow-none p-5 gap-4 bg-card">
            <CardHeader className="p-0 space-y-1">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Users className="size-5 text-primary" />
                Daftar Penghuni Kamar Kos
              </CardTitle>
              <CardDescription className="text-xs">
                {members.length} Anggota aktif terdaftar di grup kas kamar kos ini
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0 space-y-3 pt-2">
              {members.map((m) => {
                const { net, status } = memberNet(m.name)
                return (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20"
                >
                  <div className="flex items-center gap-3">
                    <div className="size-9 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center border border-primary/20 shrink-0">
                      {m.avatar}
                    </div>
                    <div>
                      <div className="font-bold text-xs text-foreground flex items-center gap-1.5">
                        {m.name}
                        {m.isMe && <span className="text-muted-foreground font-normal">(Saya)</span>}
                        {m.role === "Ketua Kos" && (
                          <Badge variant="outline" className="text-[10px] py-0 px-1 font-semibold border-border">
                            Ketua
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{m.roomNumber}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      {status === "owes" ? (
                        <Badge className="bg-rose-500/10 text-rose-600 dark:text-rose-400 border-none shadow-none text-xs font-semibold">
                          Utang {fmt(Math.abs(net))}
                        </Badge>
                      ) : status === "is_owed" ? (
                        <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-none shadow-none text-xs font-semibold">
                          Piutang +{fmt(net)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs font-normal border-border">
                          Lunas / {symbol} 0
                        </Badge>
                      )}
                    </div>

                    {iAmKetua && !m.isMe && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 shrink-0 text-muted-foreground hover:text-rose-600"
                            disabled={removingId === m.id}
                            title={`Keluarkan ${m.name}`}
                          >
                            <UserMinus className="size-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle className="text-rose-600 dark:text-rose-400">
                              Keluarkan {m.name} dari kamar?
                            </AlertDialogTitle>
                            <AlertDialogDescription className="text-xs leading-relaxed">
                              {m.name} tidak lagi jadi anggota kamar ini.
                              {status !== "clear" && (
                                <>
                                  {" "}
                                  <strong>
                                    Perhatian: posisi utang-piutangnya belum lunas (
                                    {status === "owes" ? "utang" : "piutang"} {fmt(Math.abs(net))}
                                    ).
                                  </strong>{" "}
                                  Sebaiknya selesaikan dulu.
                                </>
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
                            <AlertDialogAction
                              className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                              onClick={() => handleRemoveMember(m)}
                            >
                              Ya, Keluarkan
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
                )
              })}
            </CardContent>
          </Card>

          {/* Right Column: Dynamic Debt Summary Matrix */}
          <Card className="border border-border shadow-none p-5 gap-4 bg-card">
            <CardHeader className="p-0 space-y-1">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <HandCoins className="size-5 text-primary" />
                Ringkasan Pelunasan Utang-Piutang Kos
              </CardTitle>
              <CardDescription className="text-xs">
                Matriks posisi siapa yang harus membayar ke siapa untuk pelunasan seimbang
              </CardDescription>
            </CardHeader>

            <CardContent className="p-0 space-y-3 pt-2">
              {debtMatrix.length === 0 ? (
                <div className="p-8 text-center rounded-xl border border-dashed border-border bg-muted/20 space-y-2">
                  <ShieldCheck className="size-8 text-emerald-600 dark:text-emerald-400 mx-auto" />
                  <div className="space-y-1">
                    <div className="font-bold text-xs text-foreground">Tidak Ada Utang-Piutang</div>
                    <p className="text-[11px] text-muted-foreground">
                      Seluruh iuran dan talangan kas kamar kos dalam posisi seimbang / lunas.
                    </p>
                  </div>
                </div>
              ) : (
                debtMatrix.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-bold text-foreground">
                        <span className="text-rose-600 dark:text-rose-400">{item.from}</span> → <span className="text-emerald-600 dark:text-emerald-400">{item.to}</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Keterangan: {item.note}
                      </div>
                    </div>

                    <div className="text-right space-y-1">
                      <div className="font-semibold text-sm text-foreground">
                        {fmt(item.amount)}
                      </div>
                      <Badge variant="outline" className="text-[10px] font-semibold border-border">
                        Belum Lunas
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
