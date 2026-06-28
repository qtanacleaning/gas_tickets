import { NextResponse } from "next/server";
import { assertOperatorRequest } from "@/lib/auth";
import { createManualTicket } from "@/lib/gas/workflows";
import { listTickets } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertOperatorRequest(request);
    return NextResponse.json({ tickets: await listTickets(75) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list tickets." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertOperatorRequest(request);
    const body = (await request.json()) as {
      folio?: unknown;
      total?: unknown;
      iva?: unknown;
      paymentType?: unknown;
    };
    const ticket = await createManualTicket({
      folio: body.folio,
      total: body.total,
      iva: body.iva,
      paymentType: body.paymentType,
    });
    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create ticket." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}
