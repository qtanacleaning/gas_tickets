import "server-only";

import { getAppEnv } from "@/lib/env";
import type { ExtractedTicket } from "@/lib/gas/types";
import { validateTicketInput } from "@/lib/gas/validation";

export type OcrResult = {
  provider: "anthropic" | "none";
  tickets: ExtractedTicket[];
  rawText?: string;
  skippedReason?: string;
};

type AnthropicContentBlock = {
  type: string;
  text?: string;
};

type AnthropicResponse = {
  content?: AnthropicContentBlock[];
};

const OCR_PROMPT = [
  "This is a photo of one or more Mexican gas station receipts from Petromayab or PEMEX.",
  "Extract all visible receipts.",
  "Return only a valid JSON array with objects using these exact fields:",
  "folio: receipt number, usually 6 to 8 digits.",
  "total: total amount as a number.",
  "iva: IVA/tax amount as a number when visible.",
  "card: Credit or Debit.",
  'Example: [{"folio":"2770441","total":1075.60,"iva":144.38,"card":"Debit"}]',
].join("\n");

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripCodeFence(raw: string): string {
  return raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
}

function parseJsonTickets(rawText: string): ExtractedTicket[] {
  const parsed = JSON.parse(stripCodeFence(rawText)) as unknown;
  if (!Array.isArray(parsed)) throw new Error("OCR response was not a JSON array.");

  return parsed.map((item) => {
    const record = item as Record<string, unknown>;
    const result = validateTicketInput({
      folio: record.folio,
      total: record.total,
      iva: record.iva,
      paymentType: record.card ?? record.tipoPago ?? record.paymentType,
    });

    if (!result.ok) {
      throw new Error(`OCR returned invalid ticket: ${result.errors.join(" ")}`);
    }

    return result.ticket;
  });
}

export function extractAllTicketsFromText(text: string): ExtractedTicket[] {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const folioRegex = /[Ff]olio\s*:?\s*(\d{6,8})/g;
  const folioMatches: Array<{ folio: string; index: number }> = [];
  let match: RegExpExecArray | null;

  while ((match = folioRegex.exec(normalized)) !== null) {
    folioMatches.push({ folio: match[1], index: match.index });
  }

  return folioMatches.flatMap((folioMatch, index) => {
    const nextIndex = folioMatches[index + 1]?.index ?? normalized.length;
    const chunk = normalized.slice(folioMatch.index, nextIndex);
    const totalMatch = chunk.match(/(?<!\w)[Tt]otal\s*:?\s*\n?\s*\$?\s*([\d,]+\.\d{2})/);
    const ivaMatch =
      chunk.match(/IVA[\s\d.,%]*:\s*\$?\s*([\d,]+\.\d{2})/i) ??
      chunk.match(/\$?\s*([\d,]+\.\d{2})\s*\n\s*IVA/i);
    const paymentMatch =
      chunk.match(/[Tt]ipo\s+de\s+[Pp]ago\s*:?\s*\n?\s*([^\n]{3,60})/) ??
      chunk.match(/[Tt]arjeta\s+(Credito|Debito|Credit|Debit)/i);

    const validation = validateTicketInput({
      folio: folioMatch.folio,
      total: totalMatch?.[1],
      iva: ivaMatch?.[1],
      paymentType: /credito|credit/i.test(paymentMatch?.[1] ?? "") ? "credit" : "debit",
    });

    return validation.ok ? [validation.ticket] : [];
  });
}

export async function extractTicketsFromImage(input: {
  base64: string;
  mimeType: string;
}): Promise<OcrResult> {
  const env = getAppEnv();
  if (!env.anthropicApiKey) {
    return {
      provider: "none",
      tickets: [],
      skippedReason: "ANTHROPIC_API_KEY is not configured.",
    };
  }

  const body = {
    model: env.anthropicModel,
    max_tokens: 700,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mimeType,
              data: input.base64,
            },
          },
          {
            type: "text",
            text: OCR_PROMPT,
          },
        ],
      },
    ],
  };

  const delays = [0, 5000, 15000, 30000];
  let lastError = "";

  for (let attempt = 0; attempt < delays.length; attempt += 1) {
    if (delays[attempt] > 0) await sleep(delays[attempt]);

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": env.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) {
      lastError = `Anthropic OCR failed with status ${response.status}: ${text.slice(0, 200)}`;
      if ((response.status === 429 || response.status === 529) && attempt < delays.length - 1) {
        continue;
      }
      throw new Error(lastError);
    }

    const parsed = JSON.parse(text) as AnthropicResponse;
    const rawText = parsed.content?.find((block) => block.type === "text")?.text?.trim();
    if (!rawText) throw new Error("Anthropic OCR response did not include text content.");

    return {
      provider: "anthropic",
      rawText,
      tickets: parseJsonTickets(rawText),
    };
  }

  throw new Error(lastError || "Anthropic OCR failed.");
}
