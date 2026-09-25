import { requireActor } from "@/lib/auth";
import Shell from "@/components/Shell";

export const dynamic = "force-dynamic";
export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireActor();
  return <Shell actor={actor}>{children}</Shell>;
}
