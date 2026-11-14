"use client";

import {useState} from "react";

type Service={id:string;folio:string;client_id:string;client_name:string;operating_company:"rerchar";
  site_name:string;origin:string;destination:string;driver_name:string|null;driver_tax_id:string|null;
  truck_plate:string|null;trailer_plate:string|null};
type Material={id:string;name:string};
type Details={site_name:string;origin:string;destination:string;driver_name:string;driver_tax_id:string;truck_plate:string;trailer_plate:string};
const blank:Details={site_name:"",origin:"",destination:"",driver_name:"",driver_tax_id:"",truck_plate:"",trailer_plate:""};
export function ReceiptMaterialSelection({clients,services,materials,linked}:{clients:{id:string;name:string}[];services:Service[];materials:Material[];linked:{service_id:string;material_id:string}[]}){
  const [mode,setMode]=useState<"directa"|"programada">("directa");
  const [client,setClient]=useState("");
  const [service,setService]=useState("");
  const [material,setMaterial]=useState("");
  const [details,setDetails]=useState<Details>(blank);
  const change=(field:keyof Details,value:string)=>setDetails(previous=>({...previous,[field]:value}));
  const reset=()=>{setService("");setMaterial("");setDetails(blank);};
  const chooseService=(id:string)=>{
    setService(id);
    const found=services.find(item=>item.id===id);
    const materialIds=[...new Set(linked.filter(item=>item.service_id===id).map(item=>item.material_id))];
    setMaterial(materialIds.length===1?materialIds[0]:"");
    setDetails(found?{site_name:found.site_name,origin:found.origin,destination:found.destination,
      driver_name:found.driver_name??"",driver_tax_id:found.driver_tax_id??"",
      truck_plate:found.truck_plate??"",trailer_plate:found.trailer_plate??""}:blank);
  };
  const ids=[...new Set(linked.filter(item=>item.service_id===service).map(item=>item.material_id))];
  const options=ids.length?materials.filter(item=>ids.includes(item.id)):materials;
  return <>
    <label>Cliente registrado<select name="client_id" required value={client} onChange={event=>{setClient(event.target.value);reset();}}><option value="">Seleccione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Forma de recepción<select name="receipt_mode" value={mode} onChange={event=>{setMode(event.target.value as "directa"|"programada");reset();}}><option value="directa">Directa de tercero, sin despacho RERCHAR</option><option value="programada">Vinculada a servicio RERCHAR</option></select></label>
    <label>Servicio RERCHAR (sólo recepción programada)<select name="service_id" value={service} disabled={mode!=="programada"} onChange={event=>chooseService(event.target.value)}><option value="">Sin vincular</option>{services.filter(item=>item.client_id===client).map(s=><option key={s.id} value={s.id}>{s.folio} · {s.client_name}</option>)}</select></label>
    <label>Material del catálogo<select name="material_id" value={material} onChange={event=>setMaterial(event.target.value)} required={ids.length>0}>
      <option value="">{ids.length?"Seleccione material de la solicitud":"Otro / pendiente de clasificar"}</option>
      {options.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
    </select>{ids.length>0&&<small>La solicitud admite {ids.length} material{ids.length===1?"":"es"} del catálogo.</small>}</label>
    <label>Faena / lugar<input name="site_name" value={details.site_name} onChange={event=>change("site_name",event.target.value)} required maxLength={180}/></label>
    <label>Origen<input name="origin" value={details.origin} onChange={event=>change("origin",event.target.value)} maxLength={180}/></label>
    <label>Destino<input name="destination" value={details.destination} onChange={event=>change("destination",event.target.value)} maxLength={180}/></label>
    <div className="form-section-title field-full">Transporte y carga</div>
    <label>Conductor<input name="driver_name" value={details.driver_name} onChange={event=>change("driver_name",event.target.value)} maxLength={120}/></label>
    <label>RUT conductor<input name="driver_tax_id" value={details.driver_tax_id} onChange={event=>change("driver_tax_id",event.target.value)} maxLength={25}/></label>
    <label>Camión<input name="truck_plate" value={details.truck_plate} onChange={event=>change("truck_plate",event.target.value)} maxLength={20}/></label>
    <label>Rampla<input name="trailer_plate" value={details.trailer_plate} onChange={event=>change("trailer_plate",event.target.value)} maxLength={30}/></label>
    {service&&<p className="helper-text field-full">Los datos del servicio se copiaron para revisión. Complete o corrija los campos según guía y recepción física.</p>}
  </>;
}
