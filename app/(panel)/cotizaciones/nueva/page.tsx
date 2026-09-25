import {randomUUID} from "node:crypto";
import Link from "next/link";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {createQuoteAction} from "@/app/quote-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";

function today(){return new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
export default async function NewQuote({searchParams}:{searchParams:Promise<{cliente?:string;error?:string}>}){
  const actor=await requireActor();if(actor.role==="conductor"||actor.role==="cliente")redirect("/cotizaciones");
  const [clients,query]=await Promise.all([db.query<{id:string;name:string;email:string|null}>("SELECT id,name,email FROM clients WHERE deleted_at IS NULL ORDER BY name"),searchParams]);
  const selected=clients.some(client=>client.id===query.cliente)?query.cliente:"";
  const start=today();const expires=new Date(`${start}T12:00:00Z`);expires.setUTCDate(expires.getUTCDate()+15);
  return <><Link href="/cotizaciones" className="back-link">← Cotizaciones</Link><div className="page-title-row"><div><div className="eyebrow">PROPUESTA COMERCIAL</div><h1>Nueva cotización</h1><p className="page-intro">Seleccione el cliente registrado y agregue los productos o servicios con sus cantidades y precios.</p></div></div>
    <Notice error={query.error}/><section className="section-card"><form action={createQuoteAction} className="form-grid"><input type="hidden" name="submission_key" value={randomUUID()}/>
      <label>Cliente<select name="client_id" defaultValue={selected} required><option value="">Seleccione un cliente</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}{c.email?` · ${c.email}`:""}</option>)}</select></label>
      <label>Empresa emisora<select name="issuer" defaultValue="rerchar"><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label>
      <label className="field-full">Título / alcance<input name="title" required minLength={3} maxLength={180} placeholder="Retiro y valorización de residuos"/></label>
      <label>Fecha de emisión<input name="issued_on" type="date" defaultValue={start} required/></label><label>Válida hasta<input name="valid_until" type="date" defaultValue={expires.toISOString().slice(0,10)} required/></label>
      <div className="form-section-title field-full">Primer concepto</div><label className="field-full">Producto o servicio<input name="description" required minLength={2} maxLength={240}/></label>
      <label>Cantidad<input name="quantity" type="number" step="0.001" min="0.001" required/></label><label>Unidad<input name="unit" maxLength={30} defaultValue="servicio" required/></label>
      <label>Precio unitario (CLP)<input name="unit_price_clp" type="number" step="0.01" min="0" required/></label><label>IVA<select name="vat_rate" defaultValue="0.19"><option value="0.19">19%</option><option value="0">0%</option></select></label>
      <label className="check-row field-full"><input name="taxable" type="checkbox" defaultChecked/> Este concepto está afecto al IVA seleccionado</label>
      <label className="field-full">Observaciones y condiciones<textarea name="notes" maxLength={1000} rows={3}/></label>
      <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!clients.length}>Crear borrador</SubmitButton></div>
    </form>{!clients.length&&<p>Primero registre un cliente en <Link href="/maestros">Maestros</Link>.</p>}</section></>;
}
