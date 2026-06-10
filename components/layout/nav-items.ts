import { Activity, BarChart3, LineChart, Map, Server, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "ภาพรวม", icon: Activity },
  { href: "/map", label: "แผนที่", icon: Map },
  { href: "/forecast", label: "พยากรณ์", icon: LineChart },
  { href: "/trends", label: "ย้อนหลัง", icon: BarChart3 },
  { href: "/analytics", label: "วิเคราะห์", icon: BarChart3 },
  { href: "/system", label: "สถานะระบบ", icon: Server },
];
