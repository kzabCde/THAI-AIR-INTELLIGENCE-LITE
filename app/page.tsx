import type { Metadata } from "next";
import { HomeLanding } from "@/components/home/home-landing";

export const metadata: Metadata = {
  title: "ประเทศไทย AI คุณภาพอากาศอัจฉริยะ | หน้าหลัก",
  description: "แพลตฟอร์ม PM2.5 ประเทศไทยแบบเรียลไทม์ ครอบคลุม 77 จังหวัด พร้อมแผนที่ เปรียบเทียบ และวิเคราะห์เชิงคาดการณ์",
};

export default function HomePage() {
  return <HomeLanding />;
}
