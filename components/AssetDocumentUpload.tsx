"use client";

import {useId,useState} from "react";
import {FileUp} from "lucide-react";
import {addAssetDocumentAction} from "@/app/asset-log-actions";
import {SubmitButton} from "./Transition";

export function AssetDocumentUpload({assetId}:{assetId:string}){
  const fieldId=useId(),errorId=useId();
  const [filename,setFilename]=useState("");
  const [error,setError]=useState("");
  return <form action={addAssetDocumentAction} className="asset-document-upload" encType="multipart/form-data">
    <input type="hidden" name="asset_id" value={assetId}/>
    <div className="asset-document-control"><label htmlFor={fieldId}>Documento PDF</label>
      <div className="asset-document-picker">
        <input id={fieldId} type="file" name="file" accept="application/pdf,.pdf" required aria-invalid={!!error} aria-describedby={error?errorId:undefined} onChange={event=>{
          const file=event.target.files?.[0];setFilename(file?.name??"");
          setError(!file?"":file.size===0?"El archivo está vacío. Seleccione un PDF con contenido.":file.size>4*1024*1024?"El PDF supera los 4 MB permitidos.":file.type!=="application/pdf"&&!/\.pdf$/i.test(file.name)?"Seleccione un documento PDF.":"");
        }}/>
        <span className="asset-document-trigger" aria-hidden="true"><FileUp size={15}/>Seleccionar PDF</span>
        <span className="asset-document-name" aria-live="polite">{filename||"Ningún archivo seleccionado"}</span>
      </div>
      {error&&<p className="asset-document-error" id={errorId} role="alert">{error}</p>}
    </div>
    <SubmitButton className="button button-outline" disabled={!filename||!!error}>Agregar documento</SubmitButton>
  </form>;
}
