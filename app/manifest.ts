import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Isan Air Intelligence — คุณภาพอากาศภาคอีสาน",
    short_name: "Isan Air",
    description:
      "ติดตาม PM2.5 / AQI แบบเรียลไทม์ 20 จังหวัดภาคอีสาน พร้อมพยากรณ์ 7 วันและวิเคราะห์ย้อนหลัง",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait-primary",
    background_color: "#0f172a",
    theme_color: "#0f172a",
    lang: "th",
    dir: "ltr",
    categories: ["weather", "health", "utilities"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "แผนที่คุณภาพอากาศ",
        short_name: "แผนที่",
        description: "ดูแผนที่ PM2.5 เรดาร์ฝน และจุดความร้อนภาคอีสาน",
        url: "/map",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "พยากรณ์ล่วงหน้า 7 วัน",
        short_name: "พยากรณ์",
        description: "พยากรณ์ค่าฝุ่น PM2.5 และสภาพอากาศล่วงหน้า",
        url: "/forecast",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "แนวโน้มย้อนหลัง",
        short_name: "ย้อนหลัง",
        description: "วิเคราะห์แนวโน้มและสถิติคุณภาพอากาศย้อนหลัง",
        url: "/trends",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
