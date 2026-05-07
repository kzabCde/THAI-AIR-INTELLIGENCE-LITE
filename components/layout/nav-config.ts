import { BarChart3, Database, Flame, Globe2, Home, MapPinned, Radar, Wind } from "lucide-react";

export const NAV_ITEMS = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/dashboard", label: "แดชบอร์ด", icon: Globe2 },
  { href: "/map", label: "แผนที่", icon: MapPinned },
  { href: "/province", label: "จังหวัดทั้งหมด", icon: Radar },
  { href: "/analytics", label: "วิเคราะห์ความเสี่ยง", icon: BarChart3 },
  { href: "/forecast", label: "พยากรณ์ฝุ่น", icon: Wind },
  { href: "/sources", label: "แหล่งข้อมูล", icon: Database },
  { href: "/about", label: "เกี่ยวกับโครงการ", icon: Flame },
];
