import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getAppEnv } from "@/lib/env";

const COOKIE_NAME = "gas_operator_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export function createOperatorSession(): string {
  const { sessionSecret } = getAppEnv();
  const issuedAt = Date.now();
  const payload = `operator.${issuedAt}`;
  return `${payload}.${sign(payload, sessionSecret)}`;
}

export function verifyOperatorSession(value: string | undefined): boolean {
  if (!value) return false;

  const { sessionSecret } = getAppEnv();
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== "operator") return false;

  const payload = `${parts[0]}.${parts[1]}`;
  const expected = sign(payload, sessionSecret);
  const issuedAt = Number(parts[1]);

  return (
    Number.isFinite(issuedAt) &&
    Date.now() - issuedAt <= SESSION_TTL_MS &&
    constantTimeEqual(parts[2], expected)
  );
}

export async function hasOperatorSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    return verifyOperatorSession(cookieStore.get(COOKIE_NAME)?.value);
  } catch {
    return false;
  }
}

export function getSessionCookieOptions() {
  return {
    name: COOKIE_NAME,
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_MS / 1000,
  };
}

export function assertOperatorRequest(request: Request): void {
  const session = parseCookieHeader(request.headers.get("cookie"), COOKIE_NAME);
  if (!verifyOperatorSession(session)) {
    throw new Error("Unauthorized");
  }
}

export function assertCronRequest(request: Request): void {
  const { cronSecret } = getAppEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    throw new Error("Unauthorized");
  }
}
