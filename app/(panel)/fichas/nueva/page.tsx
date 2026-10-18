import {redirect} from "next/navigation";
import Link from "next/link";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {moduleReady} from "@/lib/schema-readiness";
import CounterpartyForm from "@/components/CounterpartyForm";
import {Notice} from "@/components/UI";

export default async function NewCounterparty({searchParams}:{searchParams:Promise<{cliente?:string;error?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  if(!await moduleReady("counterparty_profiles"))redirect("/fichas");
  const [clients,query]=await Promise.all([db.query<{id:string;name:string;tax_id:string|null;email:string|null;address:string|null}>(
    "SELECT id,name,tax_id,email,address FROM clients WHERE deleted_at IS NULL ORDER BY name"),searchParams]);
  return <><div className="page-title-row"><div><Link href="/fichas" className="back-link">← Fichas</Link><h1>Nueva ficha</h1><p className="page-intro">Complete los datos del formulario entregado por Carol. Los documentos se adjuntan después de guardar.</p></div></div><Notice error={query.error}/><section className="section-card"><CounterpartyForm clients={clients} selectedClient={clients.find(c=>c.id===query.cliente)}/></section></>;
}
