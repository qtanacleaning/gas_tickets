import "server-only";

import type { EnvClientAccount, EnvOperatorAccount } from "@/lib/gas/types";

export type AppEnv = {
  adminPassword: string;
  clientPassword?: string;
  sessionSecret: string;
  cronSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  receiptBucket: string;
  petromayabBaseUrl: string;
  petromayabReferencia: string;
  petromayabVoucherUseId: string;
  petromayabPaymentWayDebit: string;
  petromayabPaymentWayCredit: string;
  anthropicApiKey?: string;
  anthropicModel: string;
};

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function parseJsonArray<T>(name: string): T[] {
  const raw = readEnv(name);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    throw new Error(`Environment variable ${name} must be a JSON array.`);
  }
}

function readIndexedAccounts<T>(prefix: string, build: (index: number) => T | null): T[] {
  const accounts: T[] = [];

  for (let index = 1; index <= 50; index += 1) {
    const hasAnyKey = Object.keys(process.env).some((key) => key.startsWith(`${prefix}_${index}_`));
    if (!hasAnyKey) continue;
    const account = build(index);
    if (account) accounts.push(account);
  }

  return accounts;
}

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getAppEnv(): AppEnv {
  return {
    adminPassword: requireEnv("ADMIN_PASSWORD"),
    clientPassword: readEnv("CLIENT_PASSWORD"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    cronSecret: requireEnv("CRON_SECRET"),
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    receiptBucket: readEnv("SUPABASE_RECEIPT_BUCKET") ?? "gas-receipts",
    petromayabBaseUrl: readEnv("PETROMAYAB_BASE_URL") ?? "https://facturacion.petromayab.net",
    petromayabReferencia: requireEnv("PETROMAYAB_REFERENCIA"),
    petromayabVoucherUseId: readEnv("PETROMAYAB_VOUCHER_USE_ID") ?? "3",
    petromayabPaymentWayDebit: readEnv("PETROMAYAB_PAYMENT_WAY_DEBIT") ?? "18",
    petromayabPaymentWayCredit: readEnv("PETROMAYAB_PAYMENT_WAY_CREDIT") ?? "4",
    anthropicApiKey: readEnv("ANTHROPIC_API_KEY"),
    anthropicModel: readEnv("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6",
  };
}

export function isSupabaseConfigured(): boolean {
  return Boolean(readEnv("NEXT_PUBLIC_SUPABASE_URL") && readEnv("SUPABASE_SERVICE_ROLE_KEY"));
}

export function getEnvOperatorAccounts(): EnvOperatorAccount[] {
  const jsonAccounts = parseJsonArray<EnvOperatorAccount>("OPERATOR_ACCOUNTS_JSON").filter(
    (account) => account.name && account.pin,
  );
  const indexedAccounts = readIndexedAccounts<EnvOperatorAccount>("OPERATOR", (index) => {
    const name = readEnv(`OPERATOR_${index}_NAME`);
    const pin = readEnv(`OPERATOR_${index}_PIN`);
    return name && pin ? { name, pin } : null;
  });

  return [...jsonAccounts, ...indexedAccounts];
}

export function getEnvClientAccounts(): EnvClientAccount[] {
  const jsonAccounts = parseJsonArray<EnvClientAccount>("CLIENT_ACCOUNTS_JSON").filter(
    (account) => account.name && account.email && account.password && account.rfc && account.taxRegime,
  );
  const indexedAccounts = readIndexedAccounts<EnvClientAccount>("CLIENT", (index) => {
    const name = readEnv(`CLIENT_${index}_NAME`);
    const email = readEnv(`CLIENT_${index}_EMAIL`);
    const password = readEnv(`CLIENT_${index}_PASSWORD`);
    const rfc = readEnv(`CLIENT_${index}_RFC`);
    const taxRegime = readEnv(`CLIENT_${index}_TAX_REGIME`);
    return name && email && password && rfc && taxRegime
      ? { name, email, password, rfc, taxRegime }
      : null;
  });

  return [...jsonAccounts, ...indexedAccounts];
}
