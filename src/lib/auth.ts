import "server-only";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getAppEnv } from "@/lib/env";
import type { UserRole } from "@/lib/gas/types";

const COOKIE_NAME = "gas_session";
const LEGACY_COOKIE_NAME = "gas_operator_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type AppSession = {
  role: UserRole;
  name?: string;
  operatorId?: string;
  clientId?: string;
  clientEmail?: string;
};

function sign(payload: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function parseCookieHeader(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  const parts = header.split(";").map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

function encodeSessionPayload(session: AppSession): string {
  return Buffer.from(JSON.stringify({ ...session, issuedAt: Date.now() })).toString("base64url");
}

function decodeSessionPayload(payload: string): (AppSession & { issuedAt: number }) | null {
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as AppSession & {
      issuedAt?: number;
    };
    if (!parsed.issuedAt || !["admin", "operator", "client"].includes(parsed.role)) return null;
    return parsed as AppSession & { issuedAt: number };
  } catch {
    return null;
  }
}

export function createAppSession(session: AppSession): string {
  const { sessionSecret } = getAppEnv();
  const payload = encodeSessionPayload(session);
  return `${payload}.${sign(payload, sessionSecret)}`;
}

export function readAppSession(value: string | undefined): AppSession | null {
  if (!value) return null;

  const { sessionSecret } = getAppEnv();
  const parts = value.split(".");
  if (parts.length !== 2) return null;

  const payload = parts[0];
  const expected = sign(payload, sessionSecret);
  const decoded = decodeSessionPayload(payload);

  if (!decoded || Date.now() - decoded.issuedAt > SESSION_TTL_MS || !constantTimeEqual(parts[1], expected)) {
    return null;
  }

  return {
    role: decoded.role,
    name: decoded.name,
    operatorId: decoded.operatorId,
    clientId: decoded.clientId,
    clientEmail: decoded.clientEmail,
  };
}

export async function getCurrentSession(): Promise<AppSession | null> {
  try {
    const cookieStore = await cookies();
    return readAppSession(cookieStore.get(COOKIE_NAME)?.value);
  } catch {
    return null;
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
  assertRoleRequest(request, ["admin", "operator"]);
}

export function getRequestSession(request: Request): AppSession | null {
  return readAppSession(parseCookieHeader(request.headers.get("cookie"), COOKIE_NAME));
}

export function assertRoleRequest(request: Request, allowedRoles: UserRole[]): AppSession {
  const session = getRequestSession(request);
  if (!session || !allowedRoles.includes(session.role)) {
    throw new Error("Unauthorized");
  }
  return session;
}

export function assertCronRequest(request: Request): void {
  const { cronSecret } = getAppEnv();
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    throw new Error("Unauthorized");
  }
}

export function getSessionCookieNames() {
  return { current: COOKIE_NAME, legacy: LEGACY_COOKIE_NAME };
}
