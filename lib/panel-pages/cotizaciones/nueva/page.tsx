import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {Notice} from "@/components/UI";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";
import {QuoteSteps} from "@/components/QuoteSteps";
import QuoteCreationForm from "@/components/QuoteCreationForm";

function today(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export default async function NewQuote({searchParams}:{searchParams:Promise<{cliente?:string;error?:string;empresa?:string;tipo?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor"||actor.role==="cliente")redirect("/cotizaciones");
  if(!await moduleReady("cotizaciones")){const query=await searchParams;return <ModuleUnavailable title="Nueva cotización" company={query.empresa==="e_y_j"?"e_y_j":"rerchar"}/>;}
  const [clients,query]=await Promise.all([db.query<{id:string;name:string;email:string|null}>("SELECT id,name,email FROM clients WHERE deleted_at IS NULL ORDER BY name"),searchParams]);
  const company=query.empresa==="e_y_j"||query.empresa==="rerchar"?query.empresa:null;
  const selected=clients.some(client=>client.id===query.cliente)?query.cliente!:"";
  const start=today();
  return <div className="quote-workspace"><Link href={company?`/cotizaciones?empresa=${company}`:"/cotizaciones"} className="back-link">← Cotizaciones</Link><div className="page-title-row"><div><div className="eyebrow">PROPUESTA COMERCIAL</div><h1>Nueva cotización</h1><p className="page-intro">Defina el cliente y el alcance. El folio se asignará cuando guarde el borrador.</p></div></div>
    <Notice error={query.error}/><QuoteSteps current={1}/><div className="quote-stage-summary"><span>PASO 01 / 03</span><div><strong>Cliente y presentación</strong><p>Después agregará conceptos, revisará ruta y costos, y preparará el documento para entregarlo.</p></div></div><section className="section-card"><QuoteCreationForm clients={clients} clientId={selected} company={company} start={start} initialPurchase={query.tipo==="compra"} submissionKey={randomUUID()}/>{!clients.length&&<p>Primero registre un cliente en <Link href="/maestros">Maestros</Link>.</p>}</section></div>;
}
