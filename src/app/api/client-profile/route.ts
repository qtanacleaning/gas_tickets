import { NextResponse } from "next/server";
import {
  assertRoleRequest,
  createAppSession,
  getSessionCookieOptions,
} from "@/lib/auth";
import { getClientByEmail, upsertClient } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export async function GET(request: Request) {
  try {
    const session = assertRoleRequest(request, ["client"]);
    const email = session.clientEmail;
    const client = email ? await getClientByEmail(email) : null;
    return NextResponse.json({ client });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load client profile." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = assertRoleRequest(request, ["client"]);
    const body = (await request.json()) as {
      name?: unknown;
      rfc?: unknown;
      email?: unknown;
      taxRegime?: unknown;
      fiscalAddressLine1?: unknown;
      fiscalAddressLine2?: unknown;
      fiscalCity?: unknown;
      fiscalState?: unknown;
      fiscalPostalCode?: unknown;
      fiscalCountry?: unknown;
      phone?: unknown;
      cfdiUse?: unknown;
    };
    const email = session.clientEmail || normalizeEmail(body.email);
    const name = String(body.name ?? "").trim();
    const rfc = String(body.rfc ?? "").trim().toUpperCase();
    const taxRegime = String(body.taxRegime ?? "").trim();

    if (!name || !rfc || !email || !taxRegime) {
      return NextResponse.json({ error: "Name, RFC, email, and tax regime are required." }, { status: 400 });
    }

    const client = await upsertClient({
      name,
      rfc,
      email,
      taxRegime,
      fiscalAddressLine1: String(body.fiscalAddressLine1 ?? ""),
      fiscalAddressLine2: String(body.fiscalAddressLine2 ?? ""),
      fiscalCity: String(body.fiscalCity ?? ""),
      fiscalState: String(body.fiscalState ?? ""),
      fiscalPostalCode: String(body.fiscalPostalCode ?? ""),
      fiscalCountry: String(body.fiscalCountry ?? "MX"),
      phone: String(body.phone ?? ""),
      cfdiUse: String(body.cfdiUse ?? "G03"),
    });
    const nextSession = {
      ...session,
      name: client.name,
      clientId: client.id,
      clientEmail: client.email,
    };
    const response = NextResponse.json({ client, session: nextSession });
    const options = getSessionCookieOptions();
    response.cookies.set(options.name, createAppSession(nextSession), options);
    return response;
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save client profile." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
