import { NextResponse } from "next/server";
import { assertOperatorRequest } from "@/lib/auth";
import { ingestReceiptUpload } from "@/lib/gas/workflows";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  try {
    assertOperatorRequest(request);
    const formData = await request.formData();
    const file = formData.get("receipt");
    const uploadedBy = String(formData.get("uploadedBy") ?? "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Receipt image is required." }, { status: 400 });
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Receipt must be JPG, PNG, or WebP." }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Receipt must be smaller than 10 MB." }, { status: 400 });
    }

    const result = await ingestReceiptUpload({
      file,
      uploadedBy: uploadedBy || undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed." },
      { status: error instanceof Error && error.message === "Unauthorized" ? 401 : 500 },
    );
  }
}
