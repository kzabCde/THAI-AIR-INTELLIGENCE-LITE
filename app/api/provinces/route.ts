import { ISAN_PROVINCES } from "@/lib/isan";
import { handle, ok } from "@/lib/api-response";

export const revalidate = 3600;

// GET /api/provinces — the 20 Isan provinces (static metadata).
export async function GET() {
  return handle(async () => ok(ISAN_PROVINCES, 3600, 86400));
}
