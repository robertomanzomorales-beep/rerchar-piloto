"use client";

import {useState} from "react";

type Service={id:string;folio:string;client_name:string;operating_company:"rerchar"};
type Material={id:string;name:string};
export function ReceiptMaterialSelection({services,materials,linked}:{services:Service[];materials:Material[];linked:{service_id:string;material_id:string}[]}){
  const [mode,setMode]=useState<"directa"|"programada">("directa");
  const [service,setService]=useState("");
  const [material,setMaterial]=useState("");
  const ids=[...new Set(linked.filter(item=>item.service_id===service).map(item=>item.material_id))];
  const options=ids.length?materials.filter(item=>ids.includes(item.id)):materials;
  return <>
    <label>Forma de recepción<select name="receipt_mode" value={mode} onChange={event=>{const value=event.target.value as "directa"|"programada";setMode(value);if(value==="directa")setService("");}}><option value="directa">Directa de tercero, sin despacho RERCHAR</option><option value="programada">Vinculada a servicio RERCHAR</option></select></label>
    <label>Servicio RERCHAR (sólo recepción programada)<select name="service_id" value={service} disabled={mode!=="programada"} onChange={event=>{
      const id=event.target.value;setService(id);
      const found=[...new Set(linked.filter(item=>item.service_id===id).map(item=>item.material_id))];
      setMaterial(found.length===1?found[0]:"");
    }}><option value="">Sin vincular</option>{services.map(s=><option key={s.id} value={s.id}>{s.folio} · {s.client_name}</option>)}</select></label>
    <label>Material del catálogo<select name="material_id" value={material} onChange={event=>setMaterial(event.target.value)} required={ids.length>0}>
      <option value="">{ids.length?"Seleccione material de la solicitud":"Otro / pendiente de clasificar"}</option>
      {options.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
    </select>{ids.length>0&&<small>La solicitud admite {ids.length} material{ids.length===1?"":"es"} del catálogo.</small>}</label>
  </>;
}
