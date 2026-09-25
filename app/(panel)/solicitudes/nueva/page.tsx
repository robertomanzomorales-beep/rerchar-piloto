import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import RequestForm from "@/components/RequestForm";
import { Breadcrumb, Notice } from "@/components/UI";

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const actor = await requireActor();
  if (actor.role === "conductor") redirect("/solicitudes");
  const [clients, sites] = await Promise.all([
    db.query<{ id: string; name: string }>("SELECT id, name FROM clients WHERE deleted_at IS NULL AND ($1::text <> 'cliente' OR id=$2::uuid) ORDER BY name", [actor.role, actor.client_id]),
    db.query<{ id: string; client_id: string; name: string }>("SELECT id, client_id, name FROM client_sites WHERE deleted_at IS NULL AND ($1::text <> 'cliente' OR client_id=$2::uuid) ORDER BY name", [actor.role, actor.client_id]),
  ]);
  const params = await searchParams;
  return <><Breadcrumb label="Nueva solicitud"/><div className="page-title-row"><div><div className="eyebrow">NUEVO REGISTRO</div><h1>Nueva solicitud</h1><p className="page-intro">Registre los datos mínimos para que el equipo pueda planificar el servicio.</p></div></div>
    <Notice error={params.error}/><section className="section-card form-card">{clients.length && sites.length ? <RequestForm clients={clients} sites={sites} clientId={actor.role === "cliente" ? actor.client_id ?? undefined : undefined} submissionKey={randomUUID()}/> : <p>Antes de crear solicitudes, registre un cliente y su centro en Maestros.</p>}</section></>;
}
