import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { listReceiptsNeedingAttention } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin", "operator"]);
    return NextResponse.json({ receipts: await listReceiptsNeedingAttention(session) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list OCR errors." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
