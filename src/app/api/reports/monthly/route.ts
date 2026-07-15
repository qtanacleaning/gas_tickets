import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { getMonthlyTicketReport } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin", "operator", "client"]);
    return NextResponse.json({ months: await getMonthlyTicketReport(session) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load the monthly report." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
