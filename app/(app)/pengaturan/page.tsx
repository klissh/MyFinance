"use client"

import React, { useState } from "react"
import { useRouter } from "next/navigation"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
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
import { CheckCircle2, Coins, TriangleAlert } from "lucide-react"
import { useMoney, type Currency } from "@/lib/currency"
import { dangerService } from "@/lib/db"

const CURRENCIES: { code: Currency; symbol: string; name: string; flag: string }[] = [
  { code: "MYR", symbol: "RM", name: "Ringgit Malaysia", flag: "🇲🇾" },
  { code: "IDR", symbol: "Rp", name: "Rupiah Indonesia", flag: "🇮🇩" },
]

export default function PengaturanPage() {
  const router = useRouter()
  const { currency, setCurrency, fmt } = useMoney()
  const [isWiping, setIsWiping] = useState(false)
  const [notification, setNotification] = useState<string | null>(null)

  const showNotification = (msg: string) => {
    setNotification(msg)
    setTimeout(() => setNotification(null), 4000)
  }

  const handleWipe = async () => {
    setIsWiping(true)
    await dangerService.wipeAll()
    setIsWiping(false)
    showNotification("Semua data berhasil dihapus. Mulai catat dari awal.")
    setTimeout(() => {
      router.push("/dashboard")
      router.refresh()
    }, 1200)
  }

  return (
    <>
      <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 data-vertical:h-4 data-vertical:self-auto" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-base">Pengaturan</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6 bg-background min-h-screen max-w-2xl">
        {notification && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-800 dark:text-emerald-300 text-xs font-medium animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 className="size-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{notification}</span>
          </div>
        )}

        {/* Mata Uang */}
        <Card className="border border-border shadow-none p-5 gap-4 bg-card">
          <CardHeader className="p-0 space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Coins className="size-5 text-primary" />
              Mata Uang Tampilan
            </CardTitle>
            <CardDescription className="text-xs">
              Mengubah simbol & format angka di seluruh aplikasi (nominal yang tersimpan
              tidak diubah — hanya tampilannya). Berlaku di device ini.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              {CURRENCIES.map((c) => {
                const active = currency === c.code
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => setCurrency(c.code)}
                    className={`flex flex-col items-start gap-1 rounded-xl border p-4 text-left transition-all ${
                      active
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card hover:bg-muted/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{c.flag}</span>
                      <span className="font-bold text-sm">{c.symbol}</span>
                      {active && <CheckCircle2 className="size-4 text-primary ml-auto" />}
                    </div>
                    <span className="text-xs text-muted-foreground">{c.name}</span>
                  </button>
                )
              })}
            </div>
            <div className="p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
              Contoh tampilan: <strong className="text-foreground">{fmt(1250.5)}</strong> ·{" "}
              <strong className="text-foreground">{fmt(50000)}</strong>
            </div>
          </CardContent>
        </Card>

        {/* Zona Berbahaya */}
        <Card className="border border-rose-500/30 shadow-none p-5 gap-4 bg-rose-500/5">
          <CardHeader className="p-0 space-y-1">
            <CardTitle className="text-base font-semibold flex items-center gap-2 text-rose-600 dark:text-rose-400">
              <TriangleAlert className="size-5" />
              Zona Berbahaya
            </CardTitle>
            <CardDescription className="text-xs">
              Hapus SEMUA data kamu: transaksi, target tabungan, sumber dana, jadwal
              tagihan, dan kamar kos (yang kamu buat ikut terhapus untuk semua anggota;
              yang cuma kamu ikuti — kamu keluar). Tidak bisa dibatalkan.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="text-xs shadow-none" disabled={isWiping}>
                  {isWiping ? (
                    <span className="flex items-center gap-1.5">
                      <Spinner className="size-3.5" /> Menghapus...
                    </span>
                  ) : (
                    "Hapus Semua Data & Mulai Bersih"
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                    <TriangleAlert className="size-5" /> Yakin hapus semua data?
                  </AlertDialogTitle>
                  <AlertDialogDescription className="text-xs leading-relaxed">
                    Seluruh transaksi, target, sumber dana, jadwal, dan kamar kos yang
                    kamu buat akan dihapus permanen dari database. Tindakan ini{" "}
                    <strong>tidak bisa dibatalkan</strong>.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="text-xs">Batal</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleWipe}
                    className="text-xs bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Ya, Hapus Semua
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
