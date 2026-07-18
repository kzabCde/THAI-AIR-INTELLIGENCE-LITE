import { timingSafeEqual } from "node:crypto";

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

export function hasRequiredSecret(name: "CRON_SECRET" | "ML_SECRET"): boolean {
  return Boolean(process.env[name]);
}

export function bearerToken(headers: Headers): string | null {
  const value = headers.get("authorization");
  if (!value) return null;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  return match?.[1] ?? null;
}

export function constantTimeEquals(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifyBearerSecret(headers: Headers, secret: string | undefined): boolean {
  if (!secret) return !isProduction();
  const token = bearerToken(headers);
  return Boolean(token && constantTimeEquals(token, secret));
}

export function parseHorizon(value: unknown, options: { defaultValue?: number; min?: number; max?: number } = {}): number {
  const defaultValue = options.defaultValue ?? 7;
  const min = options.min ?? 1;
  const max = options.max ?? 14;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : defaultValue;
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`horizon must be an integer between ${min} and ${max}`);
  }
  return parsed;
}
