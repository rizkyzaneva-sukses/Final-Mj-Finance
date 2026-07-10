"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Menu, MoonStar, SunMedium, X } from "lucide-react";
import { useEffect, useState } from "react";

const navLinks = [
  { href: "/#fitur", label: "Fitur" },
  { href: "/#cara-kerja", label: "Cara Kerja" },
  { href: "/#komunitas", label: "Komunitas" },
  { href: "/guide", label: "Panduan" },
];

export function SiteHeader({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const current = (typeof document !== "undefined" && document.documentElement.dataset.theme) || "light";
    setTheme(current as "light" | "dark");
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toggleTheme() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("mj-theme", next);
    } catch {}
  }

  function go(href: string) {
    setOpen(false);
    if (href.startsWith("/#") && pathname === "/") {
      const el = document.querySelector(href.slice(1));
      el?.scrollIntoView({ behavior: "smooth" });
    } else if (href.startsWith("/#")) {
      router.push(href);
    }
  }

  return (
    <header className={`site-header ${scrolled ? "site-header-scrolled" : ""}`}>
      <div className="site-header-inner">
        <Link href="/" className="site-brand">
          <span className="brand-seal">MJ</span>
          <div><strong>MUDA JUARA</strong><small>FINANCE</small></div>
        </Link>

        <nav className="site-nav">
          {navLinks.map((item) => (
            <button key={item.href} type="button" className="site-nav-link" onClick={() => go(item.href)}>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="site-actions">
          <button className="site-theme" onClick={toggleTheme} type="button" aria-label={theme === "dark" ? "Mode terang" : "Mode gelap"}>
            {theme === "dark" ? <SunMedium size={18} /> : <MoonStar size={18} />}
          </button>
          <Link href={authenticated ? "/dashboard" : "/login"} className="button button-primary site-cta">
            {authenticated ? "Buka Dashboard" : "Masuk"}
          </Link>
          <button className="site-burger" onClick={() => setOpen(true)} aria-label="Buka menu"><Menu /></button>
        </div>
      </div>

      {open && (
        <div className="site-mobile" role="dialog" aria-modal="true">
          <div className="site-mobile-scrim" onClick={() => setOpen(false)} />
          <aside className="site-mobile-panel">
            <div className="site-mobile-top">
              <span className="brand-seal">MJ</span>
              <button className="site-mobile-close" onClick={() => setOpen(false)} aria-label="Tutup menu"><X /></button>
            </div>
            <nav className="site-mobile-nav">
              {navLinks.map((item) => (
                <button key={item.href} type="button" onClick={() => go(item.href)}>{item.label}</button>
              ))}
            </nav>
            <div className="site-mobile-actions">
              <button className="site-theme site-theme-wide" onClick={toggleTheme} type="button">
                {theme === "dark" ? <SunMedium size={18} /> : <MoonStar size={18} />}
                {theme === "dark" ? "Mode terang" : "Mode gelap"}
              </button>
              <Link href={authenticated ? "/dashboard" : "/login"} className="button button-primary button-wide" onClick={() => setOpen(false)}>
                {authenticated ? "Buka Dashboard" : "Masuk"}
              </Link>
            </div>
          </aside>
        </div>
      )}
    </header>
  );
}
