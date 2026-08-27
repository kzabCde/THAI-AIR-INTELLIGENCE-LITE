import { CloudSun, History, Home, MapPinned, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "หน้าแรก", icon: Home },
  { href: "/map", label: "แผนที่", icon: MapPinned },
  { href: "/forecast", label: "พยากรณ์", icon: CloudSun },
  { href: "/trends", label: "ย้อนหลัง", icon: History },
];
