"use client";

import {useId,useState,type ReactNode} from "react";
import {FileUp} from "lucide-react";
import {importSiiXmlAction} from "@/app/sii-document-actions";
import {companies,type Company} from "@/lib/companies";
import {SubmitButton} from "@/components/Transition";

export default function SiiXmlImport({settings,company,children}:{
  settings:{company:Company;tax_id:string|null}[];company:Company|"";children:ReactNode;
}){
  const [selected,setSelected]=useState(settings.some(s=>s.company===company&&s.tax_id)?company:"");
  const [filename,setFilename]=useState(""),[error,setError]=useState("");
  const fieldId=useId(),hintId=useId(),errorId=useId();
  const available=settings.some(s=>s.tax_id),configured=settings.some(s=>s.company===selected&&s.tax_id);
  return <form action={importSiiXmlAction} className="form-grid sii-import-form">{children}
    <label>Empresa<select name="company" required value={selected} disabled={!available}
      onChange={event=>setSelected(event.target.value as Company|"")}>
      <option value="">{available?"Seleccione una empresa":"Configure primero el RUT de la empresa"}</option>
      {settings.map(s=><option key={s.company} value={s.company} disabled={!s.tax_id}>
        {companies[s.company].short}{s.tax_id?` · ${s.tax_id}`:" · RUT pendiente"}
      </option>)}
    </select></label>
    <div className="xml-file-control"><label htmlFor={fieldId}>Documento o envío XML</label>
      <div className={`xml-file-field${configured?"":" is-disabled"}`}>
        <input id={fieldId} className="xml-file-native" type="file" name="xml" accept=".xml,text/xml,application/xml"
          required disabled={!configured} aria-describedby={`${hintId}${error?` ${errorId}`:""}`} aria-invalid={!!error}
          onChange={event=>{const file=event.target.files?.[0];setFilename(file?.name??"");
            setError(file&&!file.size?"El archivo está vacío.":file&&file.size>3*1024*1024?"El archivo supera los 3 MB. Seleccione uno más pequeño.":"");}}/>
        <span className="xml-file-trigger" aria-hidden="true"><FileUp size={16}/> Seleccionar XML</span>
        <span className="xml-file-name" aria-live="polite">{filename||"Ningún archivo seleccionado"}</span>
      </div>
      {error&&<p id={errorId} className="xml-file-error" role="alert">{error}</p>}
    </div>
    <div className="field-full sii-import-footer"><p id={hintId} className="helper-text">
      {!available?<>Para habilitar la carga, <a href="#sii-company-settings">registre el RUT de la empresa</a>.</>:
        !configured?"Seleccione una empresa con RUT registrado para habilitar el archivo.":
        "El documento se revisará para comprobar su empresa y evitar duplicados."}
    </p><SubmitButton className="button button-primary" disabled={!configured||!filename||!!error}>Incorporar para revisión</SubmitButton></div>
  </form>;
}
