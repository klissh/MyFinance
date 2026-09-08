"use client"

import * as React from "react"
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  WalletIcon,
  DollarSignIcon,
  CalendarIcon,
  UsersIcon,
  PlusIcon,
} from "lucide-react"

import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { authService, kamarService, UserSession, KamarRoomRecord } from "@/lib/db"

// Menu personal - flat, langsung navigasi
const navMain = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: <LayoutDashboardIcon />,
  },
  {
    title: "Transaksi",
    url: "/transaksi",
    icon: <ArrowLeftRightIcon />,
  },
  {
    title: "Sumber Dana & Target",
    url: "/finance",
    icon: <WalletIcon />,
    isActive: true,
    items: [
      { title: "Sumber Dana", url: "/finance" },
      { title: "Nabung & Target", url: "/goals" },
    ],
  },
  {
    title: "Kurs Mata Uang",
    url: "/kurs",
    icon: <DollarSignIcon />,
  },
  {
    title: "Jadwal",
    url: "/scheduled",
    icon: <CalendarIcon />,
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  // Default statis dulu (aman untuk SSR/hydration); nilai asli dari localStorage
  // dibaca setelah mount pada effect di bawah.
  const [currentUser, setCurrentUser] = React.useState<UserSession>({
    id: "usr_default",
    fullName: "Pengguna",
    email: "user@example.com",
  })
  const [activeRoom, setActiveRoom] = React.useState<KamarRoomRecord | null>(null)

  const refreshFromCache = React.useCallback(() => {
    const user = authService.getCurrentUser()
    if (user) setCurrentUser(user)
    setActiveRoom(kamarService.getUserRoom())
  }, [])

  React.useEffect(() => {
    // Sinkronisasi satu kali dari cache localStorage saat mount (bukan cascading render).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshFromCache()
    const handleRoomUpdate = () => refreshFromCache()
    window.addEventListener("room-updated", handleRoomUpdate)
    return () => window.removeEventListener("room-updated", handleRoomUpdate)
  }, [refreshFromCache])

  // Saat aplikasi dibuka: verifikasi user & sinkronkan keanggotaan kamar dari
  // Supabase supaya status "sudah gabung kamar mana" ikut pindah antar device.
  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      const verified = await authService.getVerifiedUser()
      if (!cancelled && verified) setCurrentUser(verified)
      const room = await kamarService.syncUserRoom() // memicu event "room-updated" → refreshFromCache
      // Selaraskan dampak split bill kos ke transaksi pribadi sekali per sesi.
      if (!cancelled && room?.id) await kamarService.reconcileRoomLedger(room.id)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const userData = {
    name: currentUser.fullName,
    email: currentUser.email,
    avatar: currentUser.avatarUrl || "/avatars/shadcn.jpg",
  }

  // Build Kamar Kos menu conditionally
  const navKamar = activeRoom
    ? [
        {
          title: activeRoom.name,
          url: "/kamar/kos",
          icon: <UsersIcon />,
          isActive: true,
          items: [
            { title: "Transaksi & Split Bill", url: "/kamar/kos" },
            { title: "Kebutuhan Bulanan", url: "/kamar/kos/kebutuhan" },
            { title: "Anggota & Tagihan Saya", url: "/kamar/kos/anggota" },
          ],
        },
      ]
    : []

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <WalletIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">MyFinance</span>
                  <span className="truncate text-xs text-muted-foreground">Personal & Kos</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Personal" items={navMain} />
        
        {/* Render menu Kamar Kos HANYA jika pengguna telah memiliki/bergabung ke kamar kos */}
        {activeRoom && <NavMain label="Kamar Kos Bersama" items={navKamar} />}

        {/* Aksi cepat untuk buat/gabung kamar baru (selalu tersedia) */}
        <SidebarMenu className="px-2 pt-2">
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Buat atau Gabung Kamar">
              <a href="/kamar/baru">
                <PlusIcon />
                <span>Buat/Gabung Kamar</span>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={userData} />
      </SidebarFooter>
    </Sidebar>
  )
}