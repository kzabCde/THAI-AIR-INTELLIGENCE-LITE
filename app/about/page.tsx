import type { Metadata } from "next";
import { ProjectTeam } from "@/components/about/project-team";

export const metadata: Metadata = {
  title: "เกี่ยวกับโครงการ",
  description:
    "ข้อมูลเกี่ยวกับโครงการ Isan Air Intelligence และทีมผู้พัฒนาระบบติดตามและพยากรณ์ PM2.5 สำหรับ 20 จังหวัดภาคตะวันออกเฉียงเหนือ",
};

export default function AboutPage() {
  return (
    <div className="space-y-10 sm:space-y-12">
      <section aria-labelledby="about-project-title" className="card card-pad">
        <p className="section-title">About Project</p>
        <h1 id="about-project-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">
          เกี่ยวกับโครงการ
        </h1>
        <div className="muted mt-4 max-w-4xl space-y-3 text-sm leading-7 sm:text-base">
          <p>
            Isan Air Intelligence เป็นแพลตฟอร์มติดตามคุณภาพอากาศ PM2.5 / AQI แบบเรียลไทม์
            สำหรับ 20 จังหวัดภาคตะวันออกเฉียงเหนือ พร้อมข้อมูลพยากรณ์ล่วงหน้าและการวิเคราะห์ข้อมูลย้อนหลัง
          </p>
          <p>
            ระบบถูกพัฒนาขึ้นเพื่อช่วยให้ผู้ใช้งานเข้าถึงข้อมูลคุณภาพอากาศและผลการพยากรณ์ได้ในรูปแบบที่อ่านง่าย
            พร้อมสนับสนุนการศึกษาและการวิเคราะห์ข้อมูลด้าน PM2.5 ของภูมิภาคอีสาน
          </p>
        </div>
      </section>

      <ProjectTeam />
    </div>
  );
}
