import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { createManualTicket } from "@/lib/gas/workflows";
import { getClientById, listTickets } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin", "operator", "client"]);
    return NextResponse.json({ tickets: await listTickets(75, session) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list tickets." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin"]);
    const body = (await request.json()) as {
      folio?: unknown;
      total?: unknown;
      iva?: unknown;
      paymentType?: unknown;
      ticketDate?: unknown;
      clientId?: unknown;
    };
    const clientId = String(body.clientId ?? "").trim();
    if (!clientId) {
      return NextResponse.json({ error: "Select a client account for the ticket." }, { status: 400 });
    }
    const client = await getClientById(clientId);
    if (!client || !client.active) {
      return NextResponse.json({ error: "The selected client account is not active." }, { status: 400 });
    }
    const ticket = await createManualTicket({
      folio: body.folio,
      total: body.total,
      iva: body.iva,
      paymentType: body.paymentType,
      ticketDate: body.ticketDate,
      client,
      operatorId: session.operatorId,
      operatorName: session.name,
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create ticket." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}
