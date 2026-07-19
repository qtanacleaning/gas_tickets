import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { getRoleDashboard } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = assertRoleRequest(request, ["operator", "client"]);
    return NextResponse.json({ dashboard: await getRoleDashboard(session) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load dashboard." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
