import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { createNotification, listSettlementCandidates, recordTicketSettlement } from "@/lib/gas/repository";
import type { SettlementKind } from "@/lib/gas/types";

export const dynamic = "force-dynamic";

function parseKind(value: unknown): SettlementKind {
  if (value === "operator_withdrawal" || value === "client_payment") return value;
  throw new Error("Invalid settlement kind.");
}

export async function GET(request: Request) {
  try {
    assertRoleRequest(request, ["admin"]);
    const kind = parseKind(new URL(request.url).searchParams.get("kind"));
    return NextResponse.json({ candidates: await listSettlementCandidates(kind) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load settlement tickets." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin"]);
    const body = (await request.json()) as { kind?: unknown; ticketIds?: unknown };
    const kind = parseKind(body.kind);
    const ticketIds = Array.isArray(body.ticketIds) ? body.ticketIds.map(String) : [];
    const selected = (await listSettlementCandidates(kind)).filter((item) => ticketIds.includes(item.ticketId));
    const settlementId = await recordTicketSettlement({ kind, ticketIds, createdBy: session.name ?? "Admin" });
    const first = selected[0];
    const amount = selected.reduce((sum, item) => sum + item.amount, 0);
    if (first) {
      await createNotification({
        recipientRole: kind === "operator_withdrawal" ? "operator" : "client",
        recipientId: first.entityId,
        recipientName: kind === "operator_withdrawal" ? first.entityName : null,
        type: kind === "operator_withdrawal" ? "withdrawal_paid" : "commission_paid",
        title: kind === "operator_withdrawal" ? "Retiro registrado" : "Pago registrado",
        message: `${amount.toFixed(2)} MXN fueron registrados para ${selected.length} ticket${selected.length === 1 ? "" : "s"}.`,
        resourceType: "settlement",
      }).catch(() => undefined);
    }
    return NextResponse.json({ settlementId }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not record settlement." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}
