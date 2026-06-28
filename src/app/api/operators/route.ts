import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { getEnvOperatorAccounts } from "@/lib/env";
import { createOperator, listOperators } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    assertRoleRequest(request, ["admin"]);
    const envOperators = getEnvOperatorAccounts().map((operator) => ({
      id: `env:${operator.name}`,
      name: operator.name,
      active: true,
      createdAt: "",
      updatedAt: "",
    }));
    return NextResponse.json({ operators: [...envOperators, ...(await listOperators())] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not list operators." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    assertRoleRequest(request, ["admin"]);
    const body = (await request.json()) as { name?: unknown; pin?: unknown };
    const operator = await createOperator({
      name: String(body.name ?? ""),
      pin: String(body.pin ?? ""),
    });
    return NextResponse.json({ operator }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not save operator." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 400 },
    );
  }
}
