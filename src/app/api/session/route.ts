import { NextResponse } from "next/server";
import { createAppSession, getSessionCookieNames, getSessionCookieOptions, getRequestSession } from "@/lib/auth";
import { getAppEnv, getEnvClientAccounts, getEnvOperatorAccounts } from "@/lib/env";
import { getClientByEmail, upsertClient, verifyClientPassword, verifyOperatorPin } from "@/lib/gas/repository";
import type { UserRole } from "@/lib/gas/types";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = getRequestSession(request);
  return NextResponse.json({ authenticated: Boolean(session), session });
}

export async function POST(request: Request) {
  try {
    const { adminPassword, clientPassword } = getAppEnv();
    const body = (await request.json()) as {
      role?: UserRole;
      password?: string;
      name?: string;
      clientEmail?: string;
    };
    const role = body.role ?? "operator";

    if (!["admin", "operator", "client"].includes(role)) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    if (role === "admin" && body.password !== adminPassword) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const clientEmail = body.clientEmail?.trim().toLowerCase();
    const envClient =
      role === "client" && clientEmail
        ? getEnvClientAccounts().find((account) => account.email.trim().toLowerCase() === clientEmail)
        : null;
    const databaseClient =
      role === "client" && clientEmail
        ? await verifyClientPassword({ email: clientEmail, password: body.password ?? "" })
        : null;

    if (role === "client") {
      const hasIndividualClients = getEnvClientAccounts().length > 0;
      const validIndividualClient = envClient?.password === body.password;
      const validSharedClientPassword = !hasIndividualClients && clientPassword && body.password === clientPassword;
      if (!databaseClient && !validIndividualClient && !validSharedClientPassword) {
        return NextResponse.json({ error: "Invalid password." }, { status: 401 });
      }
    }

    const envOperator =
      role === "operator"
        ? getEnvOperatorAccounts().find(
            (account) =>
              account.name.trim().toLowerCase() === body.name?.trim().toLowerCase() &&
              account.pin === body.password,
          )
        : null;
    const operator = role === "operator" && !envOperator
      ? await verifyOperatorPin({ name: body.name ?? "", pin: body.password ?? "" })
      : null;
    if (role === "operator" && !operator) {
      if (!envOperator) {
        return NextResponse.json({ error: "Invalid operator or PIN." }, { status: 401 });
      }
    }

    const client = databaseClient ?? (envClient
      ? await upsertClient({
          name: envClient.name,
          rfc: envClient.rfc,
          email: envClient.email,
          taxRegime: envClient.taxRegime,
        })
      : role === "client" && clientEmail
        ? await getClientByEmail(clientEmail)
        : null);
    const session = {
      role,
      name:
        envOperator?.name ??
        operator?.name ??
        client?.name ??
        (body.name?.trim() || (role === "admin" ? "Admin" : undefined)),
      operatorId: operator?.id,
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
