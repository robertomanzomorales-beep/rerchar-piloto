import {Upload} from "lucide-react";
import {addEvidenceAction} from "@/app/actions";
import {SubmitButton} from "@/components/Transition";

type Evidence={id:string;document_kind:string;storage_key:string|null;original_filename:string|null};
const driverDocuments=[
  {kind:"guia_traslado",label:"Guía de Traslado",required:true},
  {kind:"ticket_pesaje",label:"Ticket de pesaje",required:false},
  {kind:"hoja_servicio",label:"Hoja de Servicio",required:true},
  {kind:"foto_material",label:"Foto del material cargado",required:false},
] as const;

export default function ServiceDocuments({id,evidence,driver,purchase}:{id:string;evidence:Evidence[];driver:boolean;purchase:boolean}){
  const limit=process.env.VERCEL?4:5;
  return <section className="section-card"><div className="section-heading"><div><div className="eyebrow">RESPALDO</div><h2><Upload size={19}/> Documentos del servicio</h2></div></div>
    <p className="helper-text">PDF, JPG, PNG o WebP; hasta {limit} MB por archivo. Las observaciones son opcionales y cada documento se guarda por separado.</p>
    {purchase&&<div className="document-card-grid">{driverDocuments.map(document=>{
      const files=evidence.filter(item=>item.document_kind===document.kind&&item.storage_key);
      return <div key={document.kind} className="document-card"><div className="document-card-title"><strong>{document.label}{document.required?" *":""}</strong><span className={files.length?"document-done":"document-pending"}>{files.length?`${files.length} cargado${files.length===1?"":"s"}`:document.required?"Pendiente":"Opcional"}</span></div>
        {files.length>0&&<small>Último archivo: {files[0].original_filename||"Respaldo guardado"}</small>}
        <form action={addEvidenceAction} className="form-stack compact"><input type="hidden" name="id" value={id}/><input type="hidden" name="document_kind" value={document.kind}/><label>Observaciones<input name="description" maxLength={500} placeholder="Ej. Cliente no entregó ticket"/></label><label>Archivo<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required/></label><SubmitButton className="button button-outline">{files.length?"Agregar otro archivo":"Cargar archivo"}</SubmitButton></form>
      </div>})}</div>}
    {!purchase&&<form action={addEvidenceAction} className="form-stack"><input type="hidden" name="id" value={id}/><label>Tipo de documento<select name="document_kind" defaultValue="evidencia">{driver?<><option value="evidencia">Evidencia general</option><option value="guia_traslado">Guía de Traslado</option><option value="ticket_pesaje">Ticket de pesaje</option><option value="hoja_servicio">Hoja de Servicio</option><option value="foto_material">Foto del material</option></>:<><option value="evidencia">Evidencia</option><option value="guia_traslado">Guía de Traslado</option><option value="ticket_pesaje">Ticket de pesaje</option><option value="hoja_servicio">Hoja de Servicio</option><option value="foto_material">Foto del material</option><option value="guia_valorizada">Guía valorizada</option><option value="factura">Factura adjunta</option><option value="certificado">Certificado externo</option><option value="resumen_retiros">Resumen de retiros</option><option value="otro">Otro</option></>}</select></label><label>Observaciones<input name="description" maxLength={500} placeholder="Detalle del respaldo"/></label><label>Archivo<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required/></label><SubmitButton className="button button-outline">Guardar documento</SubmitButton></form>}
    {purchase&&!driver&&<details className="cancel-control"><summary>Agregar otro documento administrativo</summary><form action={addEvidenceAction} className="form-stack compact"><input type="hidden" name="id" value={id}/><label>Tipo<select name="document_kind"><option value="guia_valorizada">Guía valorizada</option><option value="factura">Factura adjunta</option><option value="certificado">Certificado externo</option><option value="resumen_retiros">Resumen de retiros</option><option value="otro">Otro</option></select></label><label>Observaciones<input name="description" maxLength={500}/></label><label>Archivo<input name="file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" required/></label><SubmitButton className="button button-outline">Guardar documento</SubmitButton></form></details>}
  </section>;
}
