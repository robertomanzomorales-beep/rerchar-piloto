import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {createQuoteAction} from "@/app/quote-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {QuoteClassification} from "@/components/QuoteClassification";
import {QuoteDates} from "@/components/QuoteDates";
import {QuoteDestinationFields} from "@/components/QuoteDestinationFields";
import {listQuoteDestinations} from "@/lib/destinations";
import {listMaterialCatalog} from "@/lib/material-stock";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

function today(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export default async function NewQuote({searchParams}:{searchParams:Promise<{cliente?:string;error?:string;empresa?:string;tipo?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor"||actor.role==="cliente")redirect("/cotizaciones");
  if(!await moduleReady("cotizaciones")){const query=await searchParams;return <ModuleUnavailable title="Nueva cotización" company={query.empresa==="e_y_j"?"e_y_j":"rerchar"}/>;}
  const [clients,destinations,materials,query]=await Promise.all([db.query<{id:string;name:string;email:string|null}>("SELECT id,name,email FROM clients WHERE deleted_at IS NULL ORDER BY name"),listQuoteDestinations(actor),listMaterialCatalog(actor),searchParams]);
  const company=query.empresa==="e_y_j"||query.empresa==="rerchar"?query.empresa:null;
  const selected=clients.some(client=>client.id===query.cliente)?query.cliente:"";
  const start=today();
  return <><Link href="/cotizaciones" className="back-link">← Cotizaciones</Link><div className="page-title-row"><div><div className="eyebrow">PROPUESTA COMERCIAL</div><h1>Nueva cotización</h1><p className="page-intro">Registre el alcance del primer concepto. En el borrador planifique el recorrido y los costos; luego ajuste el precio y añada los demás servicios en la misma vista.</p></div></div>
    <Notice error={query.error}/><section className="section-card"><form action={createQuoteAction} className="form-grid"><input type="hidden" name="submission_key" value={randomUUID()}/>
      <label>Cliente<select name="client_id" defaultValue={selected} required><option value="">Seleccione un cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.email?` · ${c.email}`:""}</option>)}</select></label>
      {company?<><input type="hidden" name="issuer" value={company}/><p className="helper-text">Empresa emisora: <strong>{company==="e_y_j"?"E y J Limitada":"RERCHAR Chile SpA"}</strong></p></>:<label>Empresa emisora<select name="issuer" defaultValue="rerchar"><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label>}
      <label className="field-full">Título / alcance<input name="title" required minLength={3} maxLength={180} placeholder="Retiro y valorización de residuos"/></label>
      <QuoteDates start={start}/>
      <div className="form-section-title field-full">Primer concepto</div><QuoteClassification principal={query.tipo==="compra"&&company!=="e_y_j"?"compra":""} segment={query.tipo==="compra"&&company!=="e_y_j"?"compra_metal":""} unit={query.tipo==="compra"&&company!=="e_y_j"?"kg":undefined} company={company??""} materials={materials} withTax withDescription/><QuoteDestinationFields destinations={destinations}/><p className="helper-text field-full">Para retiros, disposición final y RESPEL, indique residuo y destino antes de entregar la propuesta. En compras RERCHAR seleccione el material del maestro. <Link href="/destinos">Configurar destinos</Link></p>
      <label>Cantidad<input name="quantity" type="number" step="0.001" min="0.001" required/></label>
      {company==="e_y_j"?<><input name="unit_price_clp" type="hidden" value="0"/><p className="helper-text">El precio de venta se define en el borrador después de calcular el recorrido y los costos. No se puede enviar una cotización sin precio.</p></>:<label>Precio unitario (CLP/kg si compra)<input name="unit_price_clp" type="number" step="0.01" min="0" required/></label>}
      <label className="field-full">Observación del concepto<textarea name="line_note" maxLength={500} rows={2}/></label>
      <label className="field-full">Observaciones y condiciones<textarea name="notes" maxLength={1000} rows={3}/></label>
      <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!clients.length}>Crear borrador</SubmitButton></div>
    </form>{!clients.length&&<p>Primero registre un cliente en <Link href="/maestros">Maestros</Link>.</p>}</section></>;
}
