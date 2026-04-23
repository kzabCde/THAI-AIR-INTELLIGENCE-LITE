import { NextResponse } from "next/server";
import { buildThailandSnapshot } from "@/lib/engine";

export const revalidate = 0;

export async function GET() {
  try {
    const data = await buildThailandSnapshot();
    return NextResponse.json({ updatedAt: new Date().toISOString(), data });
  } catch {
    return NextResponse.json({ error: "ไม่สามารถโหลดข้อมูลคุณภาพอากาศได้" }, { status: 500 });
  }
}
