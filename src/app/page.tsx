import { OperatorPortal } from "@/components/OperatorPortal";
import { getCurrentSession } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";
import { listTickets } from "@/lib/gas/repository";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getCurrentSession();
  const initialTickets =
    session && isSupabaseConfigured() ? await listTickets(75, session).catch(() => []) : [];

  return <OperatorPortal initialSession={session} initialTickets={initialTickets} />;
}
