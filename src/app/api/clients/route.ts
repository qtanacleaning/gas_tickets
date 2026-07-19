import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { createClientAccount, listClients } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertRoleRequest(request, ["admin"]);
    return NextResponse.json({ clients: (await listClients()).filter((client) => client.active) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list clients." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertRoleRequest(request, ["admin"]);
    const body = (await request.json()) as Record<string, unknown>;
    const client = await createClientAccount({
      name: String(body.name ?? ""),
      rfc: String(body.rfc ?? ""),
      email: String(body.email ?? ""),
      taxRegime: String(body.taxRegime ?? ""),
      password: String(body.password ?? ""),
    });
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save client account." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}
