"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpenText, Building2, FileUp, Landmark, LogOut, Menu, ReceiptText, X } from "lucide-react";
import { useState } from "react";
import type { AppRole } from "@/lib/auth";

const links = [
  { href: "/dashboard", label: "Ringkasan", icon: BarChart3 },
  { href: "/imports", label: "Impor Data", icon: FileUp },
  { href: "/transactions", label: "Transaksi", icon: ReceiptText },
  { href: "/reports", label: "Laporan", icon: Landmark },
  { href: "/guide", label: "Panduan", icon: BookOpenText },
  { href: "/master", label: "Master Data", icon: Building2, financeOnly: true },
];

export function AppShell({ role, children }: { role: AppRole; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="app-frame">
      <button className="mobile-menu" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu /></button>
      {open && <button className="nav-scrim" onClick={() => setOpen(false)} aria-label="Tutup menu" />}
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <button className="sidebar-close" onClick={() => setOpen(false)} aria-label="Tutup menu"><X /></button>
        <div className="brand">
          <span className="brand-seal">MJ</span>
          <div><strong>MUDA JUARA</strong><small>FINANCE</small></div>
        </div>
        <div className="role-chip">{role === "FINANCE" ? "Menteri Keuangan" : "Kementerian"}</div>
        <nav>
          {links.filter((item) => !item.financeOnly || role === "FINANCE").map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return <Link key={item.href} href={item.href} className={active ? "active" : ""} onClick={() => setOpen(false)}><Icon size={19} />{item.label}</Link>;
          })}
        </nav>
        <div className="sidebar-note"><span>Arus kas sehat dimulai dari data yang rapi.</span></div>
        <button className="logout-button" onClick={logout}><LogOut size={18} /> Keluar</button>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
