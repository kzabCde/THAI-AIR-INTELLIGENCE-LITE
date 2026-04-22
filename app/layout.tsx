import type { Metadata } from "next";
import { IBM_Plex_Sans_Thai, Kanit, Prompt, Sarabun } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { MobileNav } from "@/components/mobile-nav";
import { SiteHeader } from "@/components/site-header";

const kanit = Kanit({ subsets: ["thai"], weight: ["400", "500", "600", "700"], variable: "--font-kanit" });
const prompt = Prompt({ subsets: ["thai"], weight: ["400", "500", "600", "700"], variable: "--font-prompt" });
const sarabun = Sarabun({ subsets: ["thai"], weight: ["400", "500", "700"], variable: "--font-sarabun" });
const ibmThai = IBM_Plex_Sans_Thai({ subsets: ["thai"], weight: ["400", "500", "600"], variable: "--font-ibm-thai" });

export const metadata: Metadata = {
  title: "แดชบอร์ดคุณภาพอากาศประเทศไทย",
  description: "ระบบติดตาม PM2.5 ประเทศไทยแบบอัปเดตสด อ่านง่าย ใช้งานได้ทั้งมือถือและคอมพิวเตอร์",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${kanit.variable} ${prompt.variable} ${sarabun.variable} ${ibmThai.variable}`}>
      <body className="min-h-screen pb-20 md:pb-0">
        <ThemeProvider />
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <MobileNav />
      </body>
    </html>
  );
}
