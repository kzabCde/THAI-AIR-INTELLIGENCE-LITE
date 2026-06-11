import type { NextRequest } from "next/server";

/**
 * Validates the Bearer token sent by the external scheduler.
 * Set INGEST_SECRET in your environment. If unset, requests are allowed
 * in development (NODE_ENV !== "production") only.
 */
export function authorized(req: NextRequest): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) {
    // Require explicit secret in production; allow open in dev.
    return process.env.NODE_ENV !== "production";
  }
  return req.headers.get("authorization") === `Bearer ${secret}`;
}
