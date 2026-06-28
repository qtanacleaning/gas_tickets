import { NextResponse } from "next/server";
import { createAppSession, getSessionCookieNames, getSessionCookieOptions, getRequestSession } from "@/lib/auth";
import { getAppEnv } from "@/lib/env";
import { getClientByEmail } from "@/lib/gas/repository";
import type { UserRole } from "@/lib/gas/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getRequestSession(request);
  return NextResponse.json({ authenticated: Boolean(session), session });
}

export async function POST(request: Request) {
  try {
    const { adminPassword, operatorPassword, clientPassword } = getAppEnv();
    const body = (await request.json()) as {
      role?: UserRole;
      password?: string;
      name?: string;
      clientEmail?: string;
    };
    const role = body.role ?? "operator";
    const expectedPassword =
      role === "admin" ? adminPassword : role === "client" ? clientPassword : operatorPassword;

    if (!["admin", "operator", "client"].includes(role) || body.password !== expectedPassword) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const clientEmail = body.clientEmail?.trim().toLowerCase();
    const client = role === "client" && clientEmail ? await getClientByEmail(clientEmail) : null;
    const session = {
      role,
      name: client?.name ?? (body.name?.trim() || (role === "admin" ? "Admin" : undefined)),
      clientId: client?.id,
      clientEmail: role === "client" ? clientEmail : undefined,
    };
    const response = NextResponse.json({ ok: true, session });
    const options = getSessionCookieOptions();
    response.cookies.set(options.name, createAppSession(session), options);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  const names = getSessionCookieNames();
  response.cookies.set(names.current, "", {
    path: "/",
    maxAge: 0,
  });
  response.cookies.set(names.legacy, "", {
    path: "/",
    maxAge: 0,
  });
  return response;
}
