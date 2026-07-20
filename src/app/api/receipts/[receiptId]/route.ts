import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { deleteFailedReceipt, retryReceiptOcr } from "@/lib/gas/workflows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type RouteContext = { params: Promise<{ receiptId: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const session = assertRoleRequest(request, ["admin", "operator"]);
    const { receiptId } = await params;
    const result = await retryReceiptOcr(receiptId, session);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not rerun OCR." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const session = assertRoleRequest(request, ["admin", "operator"]);
    const { receiptId } = await params;
    await deleteFailedReceipt(receiptId, session);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not delete receipt." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}
