import "server-only";

import crypto from "node:crypto";
import { getAppEnv } from "@/lib/env";
import type { GasTicketRecord } from "@/lib/gas/types";

type PetromayabSession = {
  cookie: string;
  csrfToken: string;
};

export type TicketClientData = {
  consumptionId: string;
  clientId: string;
};

export type InvoiceResult = {
  ok: boolean;
  response: unknown;
};

function userAgent(): string {
  return "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36";
}

function extractSessionCookie(setCookie: string | null): string {
  if (!setCookie) return "";
  const match = setCookie.match(/ASP\.NET_SessionId=([^;]+)/i);
  return match ? `ASP.NET_SessionId=${match[1]}` : "";
}

function extractCsrfToken(html: string): string {
  const patterns = [
    /name=['"]__RequestVerificationToken['"][^>]*value=['"]([^'"]+)['"]/i,
    /value=['"]([^'"]+)['"][^>]*name=['"]__RequestVerificationToken['"]/i,
    /<meta[^>]+name=['"]csrf-token['"][^>]+content=['"]([^'"]+)['"]/i,
    /csrfToken['"\s]*[:=]['"\s]*['"]([0-9a-f-]{36})['"]/i,
    /['"]cSRFToken['"]['"\s]*[:=]['"\s]*['"]([0-9a-f-]{36})['"]/i,
    /RequestVerificationToken[^='"]+=\s*['"]([^'"]+)['"]/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

async function fetchCsrfFallback(baseUrl: string, cookie: string): Promise<string> {
  const endpoints = ["/Home/GetCsrfToken", "/Account/GetAntiForgeryToken", "/api/csrf", "/Home/Index"];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
          cookie,
          "user-agent": userAgent(),
        },
      });

      if (!response.ok) continue;
      const text = await response.text();
      const match = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (match?.[0]) return match[0];
    } catch {
      // Try the next fallback endpoint.
    }
  }

  return crypto.randomUUID();
}

export async function getSessionAndCsrf(): Promise<PetromayabSession> {
  const env = getAppEnv();
  const response = await fetch(`${env.petromayabBaseUrl}/`, {
    redirect: "manual",
    headers: {
      "user-agent": userAgent(),
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (![200, 301, 302].includes(response.status)) {
    throw new Error(`Could not load Petromayab homepage. Status: ${response.status}`);
  }

  const cookie = extractSessionCookie(response.headers.get("set-cookie"));
  const html = await response.text();
  const csrfToken = extractCsrfToken(html) || (await fetchCsrfFallback(env.petromayabBaseUrl, cookie));

  return { cookie, csrfToken };
}

export async function findTicketAndClientData(
  session: PetromayabSession,
  ticket: GasTicketRecord,
): Promise<TicketClientData> {
  const env = getAppEnv();
  const ticketField = `${env.petromayabReferencia.padStart(7, "0")}-${ticket.folio}`;
  const payload = {
    rfc: ticket.rfc,
    ticket: ticketField,
    amount: ticket.importeTotal,
    consumptionId: "",
    invoicingReference: "",
    cSRFToken: session.csrfToken,
  };

  const response = await fetch(`${env.petromayabBaseUrl}/Home/FindTicketAndClientData`, {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=UTF-8",
      accept: "application/json, text/javascript, */*; q=0.01",
      cookie: session.cookie,
      origin: env.petromayabBaseUrl,
      referer: `${env.petromayabBaseUrl}/`,
      "x-requested-with": "XMLHttpRequest",
      "user-agent": userAgent(),
    },
    body: JSON.stringify(payload),
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`FindTicketAndClientData failed with status ${response.status}`);
  }

  const postCookie = extractSessionCookie(response.headers.get("set-cookie"));
  if (postCookie && !session.cookie) session.cookie = postCookie;

  const parsed = JSON.parse(body) as {
    data?: Record<string, unknown>;
    clients?: Array<Record<string, unknown>>;
    isError?: boolean;
    message?: string;
  };

  if (parsed.isError) {
    if (/ya fue facturado|already invoiced/i.test(parsed.message ?? "")) {
      throw new Error(`Already invoiced: folio ${ticket.folio}`);
    }
    throw new Error(`FindTicket rejected folio ${ticket.folio}: ${parsed.message ?? "isError=true"}`);
  }

  const data = (parsed.data ?? parsed) as Record<string, unknown>;
  const consumptionId = String(data.ConsumptionId ?? data.consumptionId ?? "").trim();
  const clients = (data.clients ?? parsed.clients ?? []) as Array<Record<string, unknown>>;
  const firstClient = clients[0];
  const clientId = firstClient
    ? String(
        firstClient.clientId ??
          firstClient.ClientId ??
          firstClient.id ??
          firstClient.Id ??
          firstClient.rfc ??
          firstClient.RFC ??
          "",
      ).trim()
    : "";

  if (!consumptionId) {
    throw new Error(`FindTicket did not return a ConsumptionId. Body: ${body.slice(0, 300)}`);
  }

  return { consumptionId, clientId };
}

export async function createInvoice(
  session: PetromayabSession,
  ticket: GasTicketRecord,
  ticketData: TicketClientData,
): Promise<InvoiceResult> {
  const env = getAppEnv();
  const paymentWayId =
    ticket.paymentType === "credit" ? env.petromayabPaymentWayCredit : env.petromayabPaymentWayDebit;
  const payload = {
    data: {
      ConsumptionId: ticketData.consumptionId,
      ClientId: ticketData.clientId,
      VoucherUseId: env.petromayabVoucherUseId,
      PaymentWayId: paymentWayId,
      ConsumptionReinvoiced: false,
    },
  };
  const endpoints = ["/Home/CreateInvoice", "/Home/CreateFact", "/Home/Facturar"];

  for (const endpoint of endpoints) {
    const response = await fetch(`${env.petromayabBaseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=UTF-8",
        accept: "application/json, text/javascript, */*; q=0.01",
        cookie: session.cookie,
        origin: env.petromayabBaseUrl,
        referer: `${env.petromayabBaseUrl}/`,
        "x-requested-with": "XMLHttpRequest",
        "user-agent": userAgent(),
      },
      body: JSON.stringify(payload),
    });

    const body = await response.text();
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`CreateInvoice failed with status ${response.status}: ${body.slice(0, 200)}`);
    }

    const parsed = JSON.parse(body) as {
      isError?: boolean;
      error?: unknown;
      Error?: unknown;
      success?: boolean;
      message?: string;
    };

    if (parsed.isError || parsed.error || parsed.Error || parsed.success === false) {
      throw new Error(`CreateInvoice error: ${parsed.message ?? body.slice(0, 300)}`);
    }

    return { ok: true, response: parsed };
  }

  throw new Error("CreateInvoice failed: all known endpoints returned 404.");
}

export async function submitTicketToPetromayab(ticket: GasTicketRecord) {
  const session = await getSessionAndCsrf();
  const ticketData = await findTicketAndClientData(session, ticket);
  const invoice = await createInvoice(session, ticket, ticketData);
  return { ticketData, invoice };
}
