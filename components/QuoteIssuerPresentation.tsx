"use client";

import {useState} from "react";

type Company="rerchar"|"e_y_j";
const introductions:Record<Company,string>={
  rerchar:"RERCHAR Chile SpA desarrolla soluciones para la gestión de residuos industriales y la valorización de materiales. La presente propuesta describe el alcance específico solicitado por el cliente.",
  e_y_j:"E y J Limitada presta servicios integrales de transporte, arriendo y apoyo operacional para clientes industriales. La presente propuesta describe el alcance específico solicitado por el cliente.",
};

export default function QuoteIssuerPresentation({company,initialPurchase=false}:{company:Company|null;initialPurchase?:boolean}){
  const [issuer,setIssuer]=useState<Company>(company??"rerchar");
  const [intro,setIntro]=useState(introductions[company??"rerchar"]);
  const [kind,setKind]=useState<"general"|"compra_material">(initialPurchase&&company!=="e_y_j"?"compra_material":"general");
  return <>
    {company?<><input type="hidden" name="issuer" value={company}/><p className="helper-text">Empresa emisora: <strong>{company==="e_y_j"?"E y J Limitada":"RERCHAR Chile SpA"}</strong></p></>:
      <label>Empresa emisora<select name="issuer" value={issuer} onChange={event=>{const next=event.target.value as Company;setIssuer(next);setIntro(introductions[next]);if(next==="e_y_j")setKind("general");}} required><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select></label>}
    {issuer==="e_y_j"?<input type="hidden" name="commercial_kind" value="general"/>:<label>Tipo de cotización<select name="commercial_kind" value={kind} onChange={event=>setKind(event.target.value as "general"|"compra_material")}><option value="general">Servicios</option><option value="compra_material">Compra de material (sólo RERCHAR)</option></select></label>}
    <label className="field-full">Presentación breve de la empresa<textarea name="company_intro" value={intro} onChange={event=>setIntro(event.target.value)} required minLength={10} maxLength={700} rows={3}/><small>Texto inicial editable. Confirme el contenido antes de emitir la cotización.</small></label>
  </>;
}
