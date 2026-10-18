import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {createQuoteAction} from "@/app/quote-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {QuoteDates} from "@/components/QuoteDates";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

function today(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export default async function NewQuote({searchParams}:{searchParams:Promise<{cliente?:string;error?:string;empresa?:string;tipo?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor"||actor.role==="cliente")redirect("/cotizaciones");
  if(!await moduleReady("cotizaciones")){const query=await searchParams;return <ModuleUnavailable title="Nueva cotización" company={query.empresa==="e_y_j"?"e_y_j":"rerchar"}/>;}
  const [clients,query]=await Promise.all([db.query<{id:string;name:string;email:string|null}>("SELECT id,name,email FROM clients WHERE deleted_at IS NULL ORDER BY name"),searchParams]);
  const company=query.empresa==="e_y_j"||query.empresa==="rerchar"?query.empresa:null;
  const selected=clients.some(client=>client.id===query.cliente)?query.cliente:"";
  const start=today();
  return <><Link href="/cotizaciones" className="back-link">← Cotizaciones</Link><div className="page-title-row"><div><div className="eyebrow">PROPUESTA COMERCIAL</div><h1>Nueva cotización</h1><p className="page-intro">Inicie el borrador con el cliente y alcance. Al guardarlo se asigna el número definitivo y podrá añadir servicios en la misma cotización, revisar ruta y costos, y fijar los precios antes de entregarla.</p></div></div>
    <Notice error={query.error}/><section className="section-card"><form action={createQuoteAction} className="form-grid"><input type="hidden" name="submission_key" value={randomUUID()}/>
      <label>Cliente<select name="client_id" defaultValue={selected} required><option value="">Seleccione un cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.email?` · ${c.email}`:""}</option>)}</select></label>
      {company?<><input type="hidden" name="issuer" value={company}/><p className="helper-text">Empresa emisora: <strong>{company==="e_y_j"?"E y J Limitada":"RERCHAR Chile SpA"}</strong></p></>:<label>Empresa emisora<select name="issuer" defaultValue="rerchar"><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label>}
      {company==="e_y_j"?<input type="hidden" name="commercial_kind" value="general"/>:<label>Tipo de cotización<select name="commercial_kind" defaultValue={query.tipo==="compra"?"compra_material":"general"}><option value="general">Servicios</option><option value="compra_material">Compra de material (sólo RERCHAR)</option></select></label>}
      <label className="field-full">Título / alcance<input name="title" required minLength={3} maxLength={180} placeholder="Retiro y valorización de residuos"/></label>
      <QuoteDates start={start}/>
      <label>IVA general<select name="vat_rate" defaultValue="0.19"><option value="0.19">19%</option><option value="0">0%</option></select></label>
      <label className="field-full">Observaciones y condiciones<textarea name="notes" maxLength={1000} rows={3}/></label>
      <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!clients.length}>Iniciar cotización y asignar número</SubmitButton></div>
    </form>{!clients.length&&<p>Primero registre un cliente en <Link href="/maestros">Maestros</Link>.</p>}</section></>;
}
