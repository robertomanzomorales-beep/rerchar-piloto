import Link from "next/link";
import {randomUUID} from "node:crypto";
import {redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import StatementHeaderForm from "@/components/StatementHeaderForm";
import {createStatementAction} from "@/app/payment-statement-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

export default async function NewStatement({searchParams}:{searchParams:Promise<{error?:string;cliente?:string;periodo?:string;formato?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/estados-pago");
  if(!await moduleReady("edp"))return <ModuleUnavailable title="Nuevo estado de pago" company="e_y_j"/>;
  const [clients,query]=await Promise.all([db.query<{id:string;name:string;tax_id:string|null;address:string|null;email:string|null}>(
    "SELECT id,name,tax_id,address,email FROM clients WHERE deleted_at IS NULL ORDER BY name"),searchParams]);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const clientId=clients.some(c=>c.id===query.cliente)?query.cliente:"";
  const period=query.periodo&&/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(query.periodo)?query.periodo:today;
  const statementType=query.formato==="arriendo"?"arriendo":"residuos";
  return <><Link href="/estados-pago" className="back-link">← Estados de pago</Link><div className="page-title-row"><div><div className="eyebrow">E Y J · NUEVO DOCUMENTO</div><h1>Crear estado de pago</h1><p className="page-intro">El encabezado identifica el período y al cliente. Luego agregará las operaciones y los conceptos valorizados.</p></div></div><Notice error={query.error}/>
    <section className="section-card"><form action={createStatementAction} className="form-grid"><input type="hidden" name="submission_key" value={randomUUID()}/>
      <label>Formato<select name="statement_type" defaultValue={statementType}><option value="residuos">Transporte y disposición final</option><option value="arriendo">Arriendo de excavadora u otro equipo</option></select></label>
      <label>N° estado de pago<input name="number" required maxLength={40} placeholder="01"/></label>
      <label>Período<input name="period_on" type="date" defaultValue={period} required/></label>
      <label>Referencia contrato (opcional)<input name="contract_reference" maxLength={100}/></label>
      <label>Contacto de E y J (opcional)<input name="issuer_contact" maxLength={160} placeholder="Correo o teléfono del emisor"/></label>
      <label>Administrador de contrato (opcional)<input name="contract_manager" maxLength={160} placeholder="Nombre según contrato"/></label>
      <div className="form-section-title field-full">Datos del cliente que quedarán en el documento</div><StatementHeaderForm clients={clients} defaultClientId={clientId}/>
      <label className="field-full">Observaciones<textarea name="notes" rows={2} maxLength={1000}/></label>
      <div className="field-full form-footer"><SubmitButton className="button button-primary" disabled={!clients.length}>Crear borrador</SubmitButton></div>
    </form></section>
  </>;
}
