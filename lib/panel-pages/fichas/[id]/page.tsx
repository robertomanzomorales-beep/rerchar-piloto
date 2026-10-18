import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireActor} from "@/lib/auth";
import {db} from "@/lib/db";
import {CounterpartyError,getCounterparty} from "@/lib/counterparties";
import {moduleReady} from "@/lib/schema-readiness";
import CounterpartyForm from "@/components/CounterpartyForm";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {uploadCounterpartyDocumentAction,verifyCounterpartyAction} from "@/app/counterparty-actions";

const documentTypes=[
  ["rut_empresa","RUT de la empresa"],["certificado_bancario","Certificado de cuenta bancaria"],
  ["carpeta_tributaria","Carpeta tributaria"],
] as const;
export default async function CounterpartyDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();if(actor.role!=="admin")redirect("/");
  if(!await moduleReady("counterparty_profiles"))redirect("/fichas");
  const {id}=await params;let detail;
  try{detail=await getCounterparty(actor,id);}catch(error){if(error instanceof CounterpartyError||error instanceof Error&&error.name==="ZodError")notFound();throw error;}
  const [clients,query]=await Promise.all([db.query<{id:string;name:string;tax_id:string|null;email:string|null;address:string|null}>(
    "SELECT id,name,tax_id,email,address FROM clients WHERE deleted_at IS NULL ORDER BY name"),searchParams]);
  const {profile,documents}=detail;
  const required=profile.kind==="cliente"?["rut_empresa","carpeta_tributaria"]:documentTypes.map(([key])=>key);
  const complete=required.every(kind=>documents.some(d=>d.kind===kind));
  return <><div className="page-title-row"><div><Link href="/fichas" className="back-link">← Fichas</Link><h1>{profile.legal_name}</h1><p className="page-intro">{profile.tax_id} · {profile.kind} · {profile.status==="verificada"?"Verificada":"Pendiente de revisión"}</p></div></div>
    <Notice error={query.error} ok={query.ok}/><section className="section-card"><div className="section-heading"><h2>Datos de la ficha</h2></div><p className="helper-text">Acceso restringido a administración. Al guardar cambios la ficha vuelve a revisión.</p><CounterpartyForm clients={clients} profile={profile}/></section>
    <section className="section-card"><h2>Respaldos del formulario</h2><p className="helper-text">PDF, PNG o JPG de hasta 4 MB. La carpeta tributaria y el RUT se requieren siempre; el certificado bancario se requiere para proveedores.</p>
      {documentTypes.map(([kind,label])=>{const file=documents.find(d=>d.kind===kind);return <div className="order-section" key={kind}><h3>{label}</h3>{file?<p><a href={`/api/fichas/documentos/${file.id}`} className="text-link">Descargar {file.filename}</a></p>:<p className="muted">Sin adjunto.</p>}
        <form action={uploadCounterpartyDocumentAction} className="form-grid"><input type="hidden" name="id" value={id}/><input type="hidden" name="kind" value={kind}/><label>Adjuntar o reemplazar<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png" required/></label><div className="form-footer"><SubmitButton className="button button-outline">Guardar respaldo</SubmitButton></div></form></div>;})}
      {profile.status==="pendiente"&&<div className="order-section"><h3>Verificación administrativa</h3><p className="helper-text">Compare los documentos y la cuenta bancaria con la fuente original. Debe verificar alguien distinto de quien hizo el último cambio.</p>
        {profile.updated_by===actor.id?<p className="muted">Una segunda persona de administración debe revisar esta ficha.</p>:!complete?<p className="muted">Complete los respaldos requeridos antes de verificar.</p>:<form action={verifyCounterpartyAction}><input type="hidden" name="id" value={id}/><SubmitButton className="button button-primary">Verificar ficha</SubmitButton></form>}</div>}
    </section></>;
}
