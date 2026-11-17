"use client";

import {useEffect,useRef,useState} from "react";
import {documentFields,type DocumentField,type DocumentReading} from "@/lib/document-fields";
export type DocumentSource={id:string;name:string};
export function DocumentReader({fields,sources=[],onApply}:{fields:DocumentField[];sources?:DocumentSource[];onApply?:(values:Partial<Record<DocumentField,string>>)=>void}){
  const root=useRef<HTMLDivElement>(null),controller=useRef<AbortController|null>(null);
  const [file,setFile]=useState<File|null>(null),[source,setSource]=useState("");
  const [reading,setReading]=useState<DocumentReading|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [values,setValues]=useState<Partial<Record<DocumentField,string>>>({}),[checked,setChecked]=useState<DocumentField[]>([]);
  useEffect(()=>()=>{controller.current?.abort();},[]);
  const reset=()=>{setReading(null);setValues({});setChecked([]);setMessage("");};
  async function read(){
    const selected=sources.find(item=>item.id===source);
    if(!file&&!selected)return;
    const abort=new AbortController();controller.current=abort;
    setBusy(true);reset();setMessage("Preparando documento…");
    const timer=setTimeout(()=>abort.abort(),90_000);
    try{
      let blob:Blob;
      if(file)blob=file;
      else{
        const response=await fetch(`/api/evidencia/${encodeURIComponent(selected!.id)}`,{signal:abort.signal,credentials:"same-origin",cache:"no-store"});
        if(!response.ok)throw new Error("No se pudo abrir el respaldo. Compruebe su sesión y permisos.");
        const size=Number(response.headers.get("content-length"));if(size>4*1024*1024)throw new Error("El respaldo supera el límite de 4 MB.");
        blob=await response.blob();
      }
      const {readDocument}=await import("@/lib/document-reader");
      const result=await readDocument(blob,{signal:abort.signal,progress:value=>{if(!abort.signal.aborted)setMessage(value);}});
      if(abort.signal.aborted)return;
      setReading(result);setValues(Object.fromEntries(result.suggestions.map(item=>[item.field,item.value])));
      setMessage(result.suggestions.some(item=>fields.includes(item.field))?"Revise los datos y marque sólo los que quiere incorporar.":"No se identificaron campos compatibles. Revise la calidad del documento y complete los datos manualmente.");
    }catch(error){setMessage(abort.signal.aborted?"Lectura cancelada o tiempo agotado. Puede volver a intentarlo.":error instanceof Error?error.message:"No fue posible leer el documento.");}
    finally{clearTimeout(timer);if(controller.current===abort){controller.current=null;setBusy(false);}}
  }
  function apply(){
    const form=root.current?.closest("form");if(!form)return;
    const selected:Partial<Record<DocumentField,string>>={};
    for(const field of checked){
      const input=form.elements.namedItem(field);
      if(!(input instanceof HTMLInputElement)||input.disabled||!fields.includes(field))continue;
      const value=values[field]?.trim();if(!value)continue;
      selected[field]=value;
      if(!input.hasAttribute("data-document-controlled")){input.value=value;input.dispatchEvent(new Event("input",{bubbles:true}));input.dispatchEvent(new Event("change",{bubbles:true}));}
    }
    onApply?.(selected);setChecked([]);setMessage(`Se incorporaron ${Object.keys(selected).length} datos al formulario. Revise el conjunto antes de guardar.`);
  }
  return <div ref={root} className="document-reader field-full">
    <div><strong>Leer guía o ticket</strong><p className="helper-text">Revise los datos leídos y seleccione cuáles incorporar. La lectura no guarda ni cierra el registro.</p></div>
    <div className="form-grid">
      {sources.length>0&&<label>Respaldo del servicio<select value={source} disabled={busy} onChange={event=>{setSource(event.target.value);setFile(null);reset();}}><option value="">Elegir respaldo</option>{sources.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <label>PDF o fotografía (hasta 4 MB)<input key={source} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" disabled={busy} onChange={event=>{setFile(event.target.files?.[0]??null);setSource("");reset();}}/></label>
      <div className="form-footer"><button type="button" className="button button-outline" disabled={busy||!file&&!source} onClick={read}>Leer documento</button>{busy&&<button type="button" className="button button-outline" onClick={()=>controller.current?.abort()}>Cancelar lectura</button>}</div>
    </div>
    <p className="helper-text" role="status" aria-live="polite">{message}</p>
    {reading&&<>
      {reading.warnings.length>0&&<ul className="document-reading-warnings">{reading.warnings.map((warning,i)=><li key={i}>{warning}</li>)}</ul>}
      <div className="document-reading-results">{reading.suggestions.filter(item=>fields.includes(item.field)).map(item=><div key={item.field}>
        <label className="check-row"><input type="checkbox" checked={checked.includes(item.field)} onChange={event=>setChecked(previous=>event.target.checked?[...previous,item.field]:previous.filter(f=>f!==item.field))}/>{documentFields[item.field]}</label>
        <label>Valor leído<input aria-label={`Valor leído: ${documentFields[item.field]}`} value={values[item.field]??""} maxLength={120} onChange={event=>setValues(previous=>({...previous,[item.field]:event.target.value}))}/><small>{item.evidence}</small></label>
      </div>)}</div>
      {reading.suggestions.some(item=>fields.includes(item.field))&&<button type="button" className="button button-outline" disabled={checked.length===0} onClick={apply}>Incorporar datos seleccionados</button>}
      {file&&<p className="helper-text">La lectura no adjunta el archivo. Guárdelo como respaldo en la ficha del registro.</p>}
    </>}
  </div>;
}
