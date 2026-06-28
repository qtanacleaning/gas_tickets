import { NextResponse } from "next/server";
import { assertRoleRequest } from "@/lib/auth";
import { ingestReceiptUpload } from "@/lib/gas/workflows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    const session = assertRoleRequest(request, ["admin", "operator", "client"]);
    const formData = await request.formData();
    const file = formData.get("receipt");
    const uploadedBy = String(formData.get("uploadedBy") ?? "").trim();
    const clientId = String(formData.get("clientId") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Receipt image is required." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Receipt must be JPG, PNG, or WebP." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Receipt must be smaller than 10 MB." }, { status: 400 });
    }

    if (session.role === "client" && !session.clientId) {
      return NextResponse.json({ error: "Complete your client profile before uploading receipts." }, { status: 400 });
    }

    const operatorName =
      session.role === "operator" ? session.name : uploadedBy || session.name || (session.role === "admin" ? "Admin" : null);

    const result = await ingestReceiptUpload({
      file,
      uploadedBy: uploadedBy || session.name || undefined,
      operatorId: session.role === "operator" ? session.operatorId : undefined,
      operatorName,
      clientId: session.role === "client" ? session.clientId : clientId || undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
