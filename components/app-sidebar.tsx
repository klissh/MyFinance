"use client"

import * as React from "react"
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  WalletIcon,
  PiggyBankIcon,
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

// Menu personal - flat, tidak ada sub-item, langsung navigasi
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

// Menu kamar - dinamis, sebaiknya di-fetch dari data user (contoh statis dulu)
// TODO: ganti dengan data asli dari API/database (kamar yang diikuti user)
const navKamar = [
  {
    title: "Kamar",
    url: "#",
    icon: <UsersIcon />,
    isActive: true,
    items: [
      { title: "Kamar Keluarga", url: "/kamar/keluarga" },
      { title: "Kamar Kos Bareng", url: "/kamar/kos" },
    ],
  },
]

// Data user - sebaiknya diganti dengan session/auth data asli
const user = {
  name: "shadcn",
  email: "m@example.com",
  avatar: "/avatars/shadcn.jpg",
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        {/* Bisa diganti dengan nama app/workspace switcher kalau perlu */}
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <WalletIcon className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">MyFinance</span>
                  <span className="truncate text-xs">Personal & Kamar</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain label="Personal" items={navMain} />
        <NavMain label="Kamar" items={navKamar} />
        {/* Aksi cepat untuk buat/gabung kamar baru */}
        <SidebarMenu className="px-2">
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
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}