import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { getCommissionSummaries, recordCommissionPayment } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin", "operator"]);
    return NextResponse.json({ commissions: await getCommissionSummaries(session) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load commissions." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin"]);
    const body = (await request.json()) as Record<string, unknown>;
    const operatorName = String(body.operatorName ?? "").trim();
    const operatorId = String(body.operatorId ?? "").trim() || null;
    const amount = Number(body.amount);
    const paymentId = await recordCommissionPayment({
      operatorId,
      operatorName,
      amount,
      createdBy: session.name ?? "Admin",
    });
    return NextResponse.json({ paymentId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record commission payment." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}
