import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "ประเทศไทย AI คุณภาพอากาศอัจฉริยะ (Thailand Air Intelligence)",
  description: "แดชบอร์ด PM2.5 วันนี้ ค่าฝุ่นประเทศไทย เช็คค่าฝุ่นจังหวัดทั้ง 77 จังหวัดแบบเรียลไทม์ พร้อมคาดการณ์พรุ่งนี้",
  keywords: ["PM2.5 วันนี้", "ค่าฝุ่นประเทศไทย", "เช็คค่าฝุ่นจังหวัด", "AQI ไทย", "Thailand Air Intelligence"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-screen pb-24 font-sans antialiased md:pb-0">
        <ThemeProvider />
        <div className="pointer-events-none fixed left-1/2 top-0 -z-10 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-cyan-300/20 blur-3xl" />
        <SiteHeader />
        <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">{children}</main>
        <footer className="mx-auto max-w-7xl px-4 pb-28 pt-6 text-center text-xs text-slate-500 md:pb-8">
          <a href="https://nowheredev.vercel.app/" target="_blank" rel="noopener noreferrer" className="inline-flex rounded-full border border-white/50 bg-white/40 px-4 py-2 shadow-sm backdrop-blur transition hover:text-slate-700 dark:border-white/10 dark:bg-slate-950/35 dark:hover:text-slate-200">
            © 2026 NOWHEREDEV<span className="sr-only"> https://nowheredev.vercel.app/</span>
          </a>
        </footer>
        <MobileNav />
      </body>
    </html>
  );
}
