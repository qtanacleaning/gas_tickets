import "server-only";

export type AppEnv = {
  operatorPassword: string;
  sessionSecret: string;
  cronSecret: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  receiptBucket: string;
  petromayabBaseUrl: string;
  petromayabReferencia: string;
  petromayabRfc: string;
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

export function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getAppEnv(): AppEnv {
  return {
    operatorPassword: requireEnv("OPERATOR_PASSWORD"),
    sessionSecret: requireEnv("SESSION_SECRET"),
    cronSecret: requireEnv("CRON_SECRET"),
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    supabaseServiceRoleKey: requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    receiptBucket: readEnv("SUPABASE_RECEIPT_BUCKET") ?? "gas-receipts",
    petromayabBaseUrl: readEnv("PETROMAYAB_BASE_URL") ?? "https://facturacion.petromayab.net",
    petromayabReferencia: requireEnv("PETROMAYAB_REFERENCIA"),
    petromayabRfc: requireEnv("PETROMAYAB_RFC"),
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
