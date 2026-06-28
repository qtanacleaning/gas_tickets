import { NextResponse } from "next/server";
import { assertOperatorRequest } from "@/lib/auth";
import { submitPendingTickets, submitTicket } from "@/lib/gas/workflows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    assertOperatorRequest(request);
    const body = (await request.json().catch(() => ({}))) as { ticketId?: string };
    const result = body.ticketId ? await submitTicket(body.ticketId) : await submitPendingTickets(5);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Submission failed." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
