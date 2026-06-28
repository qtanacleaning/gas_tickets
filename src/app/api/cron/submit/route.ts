import { NextResponse } from "next/server";
import { assertCronRequest } from "@/lib/auth";
import { submitPendingTickets } from "@/lib/gas/workflows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  try {
    assertCronRequest(request);
    return NextResponse.json({ results: await submitPendingTickets(10) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Submit cron failed." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
