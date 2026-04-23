import { NextResponse } from "next/server";
import { buildThailandSnapshot } from "@/lib/engine";

export const revalidate = 0;

let cachedSnapshot: { updatedAt: string; data: Awaited<ReturnType<typeof buildThailandSnapshot>> } | null = null;

export async function GET() {
  try {
    const data = await buildThailandSnapshot();
    const payload = { updatedAt: new Date().toISOString(), data };
    cachedSnapshot = payload;

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch {
    if (cachedSnapshot) {
      return NextResponse.json(
        { ...cachedSnapshot, fallback: true },
        {
          headers: {
            "Cache-Control": "no-store, max-age=0",
          },
        },
      );
    }

    return NextResponse.json({ error: "ไม่สามารถโหลดข้อมูลคุณภาพอากาศได้" }, { status: 500 });
  }
}
