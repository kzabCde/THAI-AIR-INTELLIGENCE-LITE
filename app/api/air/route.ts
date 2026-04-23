import { NextResponse } from "next/server";
import { buildThailandSnapshot } from "@/lib/engine";

export const revalidate = 0;

const SNAPSHOT_TTL_MS = 30_000;

let cachedSnapshot: { updatedAt: string; data: Awaited<ReturnType<typeof buildThailandSnapshot>> } | null = null;
let lastBuildAt = 0;

export async function GET() {
  const now = Date.now();

  if (cachedSnapshot && now - lastBuildAt < SNAPSHOT_TTL_MS) {
    return NextResponse.json(cachedSnapshot, {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
      },
    });
  }

  try {
    const data = await buildThailandSnapshot();
    const payload = { updatedAt: new Date().toISOString(), data };
    cachedSnapshot = payload;
    lastBuildAt = now;

    return NextResponse.json(payload, {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=40",
      },
    });
  } catch {
    if (cachedSnapshot) {
      return NextResponse.json(
        { ...cachedSnapshot, fallback: true },
        {
          headers: {
            "Cache-Control": "public, s-maxage=10, stale-while-revalidate=20",
          },
        },
      );
    }

    return NextResponse.json({ error: "ไม่สามารถโหลดข้อมูลคุณภาพอากาศได้" }, { status: 500 });
  }
}
