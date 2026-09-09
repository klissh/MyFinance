"use client"

import { useMoney } from "@/lib/currency"
import React, { useState } from "react"
import { useRouter } from "next/navigation"
import { kamarService } from "@/lib/db"
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
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Spinner } from "@/components/ui/spinner"
import {
  Plus,
  KeyRound,
  Building2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
} from "lucide-react"

export default function BuatKamarBaruPage() {
  const { formatInput, parseInput, symbol } = useMoney()
  const router = useRouter()

  // Form State: Buat Kamar
  const [createRoomName, setCreateRoomName] = useState("")
  const [createLocation, setCreateLocation] = useState("")
  const [createMonthlyFee, setCreateMonthlyFee] = useState("")
  const [createMaxMembers, setCreateMaxMembers] = useState("4")
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false)

  // Form State: Gabung Kamar
  const [joinCode, setJoinCode] = useState("")
  const [isSubmittingJoin, setIsSubmittingJoin] = useState(false)

  // Notification Toast
  const [notification, setNotification] = useState<string | null>(null)
  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  const formatNumberWithDots = formatInput
  const parseFormattedNumber = parseInput

  // Handle Buat Kamar
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!createRoomName) return

    setIsSubmittingCreate(true)
    const feeNum = parseFormattedNumber(createMonthlyFee) || 200000
    const room = await kamarService.createRoom(
      createRoomName,
      createLocation,
      feeNum,
      Number(createMaxMembers) || 4
    )
    showNotification(`Kamar "${room.name}" berhasil dibuat! Kode undangan: ${room.code}`)
    setIsSubmittingCreate(false)
    router.push("/kamar/kos")
  }

  // Handle Gabung Kamar
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!joinCode) return

    setIsSubmittingJoin(true)
    const { room, error } = await kamarService.joinRoom(joinCode)
    setIsSubmittingJoin(false)

    if (error || !room) {
      showNotification(error || "Gagal bergabung ke kamar.")
      return
    }

    showNotification(`Berhasil bergabung ke kamar "${room.name}" (kode ${room.code})!`)
    router.push("/kamar/kos")
  }

  return (
    <>
      {/* Header Bar */}
      <header className="flex h-16 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div className="flex items-center gap-2">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-vertical:h-4 data-vertical:self-auto"
          />
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="#">Kamar</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="font-semibold text-base">
                  Buat atau Gabung Kamar
                </BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-h-screen">
        {/* Notification Toast */}
        {notification && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* Title Header */}
        <div>
          <h1 className="text-lg font-bold text-foreground">Buat atau Gabung Kamar Kos Bersama</h1>
          <p className="text-xs text-muted-foreground">
            Kelola kas bersama, patungan tagihan, dan keanggotaan kos dalam satu tempat
          </p>
        </div>

        {/* 2-Column Cards Grid */}
        <div className="grid gap-6 md:grid-cols-2">
          {/* Card 1: Buat Kamar Baru */}
          <Card className="border border-border shadow-none p-6 gap-5 bg-card flex flex-col justify-between">
            <CardHeader className="p-0 space-y-1.5">
              <div className="size-10 rounded-xl bg-muted/60 flex items-center justify-center text-foreground">
                <Plus className="size-5 text-primary" />
              </div>
              <CardTitle className="text-base font-semibold pt-1">Buat Kamar Kos Baru</CardTitle>
              <CardDescription className="text-xs">
                Buat grup kamar kos baru dan undang teman se-kos Anda menggunakan kode unik
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleCreateRoom} className="space-y-4 pt-1">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Nama Kamar / Grup Kos</label>
                <Input
                  placeholder="Contoh: Kos Anugerah Kamar #102"
                  value={createRoomName}
                  onChange={(e) => setCreateRoomName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Lokasi / Alamat Kos (Opsional)</label>
                <Input
                  placeholder="Contoh: Jl. Dago No. 45, Bandung"
                  value={createLocation}
                  onChange={(e) => setCreateLocation(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Iuran Bulanan ({symbol})</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder={symbol === "RM" ? "500.00" : "200.000"}
                    value={createMonthlyFee}
                    onChange={(e) => setCreateMonthlyFee(formatNumberWithDots(e.target.value))}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Jumlah Anggota Kos</label>
                  <Select value={createMaxMembers} onValueChange={setCreateMaxMembers}>
                    <SelectTrigger className="w-full text-xs font-semibold border-border">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 Orang</SelectItem>
                      <SelectItem value="3">3 Orang</SelectItem>
                      <SelectItem value="4">4 Orang</SelectItem>
                      <SelectItem value="6">6 Orang</SelectItem>
                      <SelectItem value="8">8 Orang</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <CardFooter className="p-0 pt-3">
                <Button type="submit" size="sm" className="w-full text-xs shadow-none" disabled={isSubmittingCreate}>
                  {isSubmittingCreate ? (
                    <div className="flex items-center gap-1.5">
                      <Spinner className="size-3.5" />
                      <span>Membuat...</span>
                    </div>
                  ) : (
                    <>
                      <Sparkles className="size-3.5 mr-1.5" />
                      <span>Buat Kamar Kos Sekarang</span>
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* Card 2: Gabung Kamar Pakai Kode Undangan */}
          <Card className="border border-border shadow-none p-6 gap-5 bg-card flex flex-col justify-between">
            <CardHeader className="p-0 space-y-1.5">
              <div className="size-10 rounded-xl bg-muted/60 text-foreground flex items-center justify-center">
                <KeyRound className="size-5 text-primary" />
              </div>
              <CardTitle className="text-base font-semibold pt-1">Gabung Kamar Kos yang Ada</CardTitle>
              <CardDescription className="text-xs">
                Masukkan kode undangan 6-digit dari ketua atau anggota kamar kos Anda
              </CardDescription>
            </CardHeader>

            <form onSubmit={handleJoinRoom} className="space-y-4 pt-1 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-muted-foreground">Kode Undangan Kamar</label>
                  <Input
                    placeholder="Contoh: KOS-BDG-102"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    className="font-mono text-sm tracking-wider uppercase"
                    required
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-1 text-xs text-muted-foreground">
                  <div className="font-semibold text-foreground flex items-center gap-1.5">
                    <Building2 className="size-4 text-primary" />
                    Manfaat Bergabung ke Kamar:
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] pt-1">
                    <li>Otomatis melihat saldo & mutasi kas kos</li>
                    <li>Transparansi iuran & patungan tagihan rutin</li>
                    <li>Hitung cepat split bill beban bersama</li>
                  </ul>
                </div>
              </div>

              <CardFooter className="p-0 pt-3">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  className="w-full text-xs shadow-none border-border"
                  disabled={isSubmittingJoin}
                >
                  {isSubmittingJoin ? (
                    <div className="flex items-center gap-1.5">
                      <Spinner className="size-3.5" />
                      <span>Bergabung...</span>
                    </div>
                  ) : (
                    <>
                      <span>Gabung Kamar Kos</span>
                      <ArrowRight className="size-3.5 ml-1.5" />
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      </div>
    </>
  )
}
