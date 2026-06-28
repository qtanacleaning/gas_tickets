import { NextResponse } from "next/server";
import { createOperatorSession, getSessionCookieOptions } from "@/lib/auth";
import { getAppEnv } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  return NextResponse.json({ authenticated: cookie.includes("gas_operator_session=") });
}

export async function POST(request: Request) {
  try {
    const { operatorPassword } = getAppEnv();
    const body = (await request.json()) as { password?: string };

    if (body.password !== operatorPassword) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    const options = getSessionCookieOptions();
    response.cookies.set(options.name, createOperatorSession(), options);
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
  response.cookies.set("gas_operator_session", "", {
    path: "/",
    maxAge: 0,
  });
  return response;
}
