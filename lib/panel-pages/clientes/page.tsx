import Link from "next/link";
import {redirect} from "next/navigation";
import {Building2} from "lucide-react";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {moduleReady} from "@/lib/schema-readiness";

export default async function Clients(){
  const actor=await requireActor();
  if(actor.role==="conductor")redirect("/");
  if(actor.role==="cliente")redirect(`/clientes/${actor.client_id}`);
  const [clients,hasProfiles]=await Promise.all([db.query<{id:string;name:string;tax_id:string|null;services:string}>(`SELECT c.id,c.name,c.tax_id,count(s.id)::text AS services
    FROM clients c LEFT JOIN service_requests s ON s.client_id=c.id AND s.deleted_at IS NULL
    WHERE c.deleted_at IS NULL GROUP BY c.id ORDER BY c.name`),moduleReady("counterparty_profiles")]);
  return <><div className="page-title-row"><div><div className="eyebrow">CARPETA DOCUMENTAL</div><h1>Clientes</h1><p className="page-intro">Cotizaciones, servicios y documentos reunidos por empresa. La ficha del cliente se registra por separado del acceso de usuario al portal.</p></div><Link href="/maestros#clientes" className="button button-primary">Registrar cliente</Link></div>
    {actor.role==="admin"&&hasProfiles&&<p className="helper-text"><Link href="/fichas" className="text-link">Abrir fichas legales, tributarias y de contacto →</Link></p>}
    <div className="table-wrap section-card"><table className="data-table"><thead><tr><th>Cliente</th><th>RUT</th><th>Servicios</th><th>Carpeta</th></tr></thead><tbody>{clients.map(client=><tr key={client.id}><td><strong>{client.name}</strong></td><td>{client.tax_id||"Pendiente"}</td><td>{client.services}</td><td><Link href={`/clientes/${client.id}`} className="button button-outline">Abrir carpeta</Link></td></tr>)}</tbody></table>{!clients.length&&<p className="muted">Registre el primer cliente desde el botón superior.</p>}</div></>;
}
