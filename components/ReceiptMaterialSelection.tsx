"use client";

import {useState} from "react";
import type {ReceiptSourceService} from "@/lib/material-receipt-sources";
import {DocumentReader} from "./DocumentReader";
import type {DocumentField} from "@/lib/document-fields";

type Material={id:string;name:string};
type Details={site_name:string;origin:string;destination:string;driver_name:string;driver_tax_id:string;truck_plate:string;trailer_plate:string};
const blank:Details={site_name:"",origin:"",destination:"",driver_name:"",driver_tax_id:"",truck_plate:"",trailer_plate:""};
const sourceDetails=(found:ReceiptSourceService):Details=>({site_name:found.site_name,origin:found.origin,
  destination:found.destination,driver_name:found.driver_name??"",driver_tax_id:found.driver_tax_id??"",
  truck_plate:found.truck_plate??"",trailer_plate:found.trailer_plate??""});
export function ReceiptMaterialSelection({clients,services,materials,linked,initialServiceId=""}:{clients:{id:string;name:string}[];
  services:ReceiptSourceService[];materials:Material[];linked:{service_id:string;material_id:string}[];initialServiceId?:string}){
  const initial=services.find(item=>item.id===initialServiceId);
  const initialIds=[...new Set(linked.filter(item=>item.service_id===initial?.id).map(item=>item.material_id))];
  const [mode,setMode]=useState<"directa"|"programada">(initial?"programada":"directa");
  const [client,setClient]=useState(initial?.client_id??"");
  const [service,setService]=useState(initial?.id??"");
  const [material,setMaterial]=useState(initialIds.length===1?initialIds[0]:"");
  const [details,setDetails]=useState<Details>(initial?sourceDetails(initial):blank);
  const [ticket,setTicket]=useState(initial?.destination_tickets.length===1?initial.destination_tickets[0]:"");
  const [originGuide,setOriginGuide]=useState("");
  const [transferGuide,setTransferGuide]=useState("");
  const [entrySheet,setEntrySheet]=useState("");
  const change=(field:keyof Details,value:string)=>setDetails(previous=>({...previous,[field]:value}));
  const reset=()=>{setService("");setMaterial("");setDetails(blank);setTicket("");setOriginGuide("");setTransferGuide("");setEntrySheet("");};
  const chooseService=(id:string)=>{
    setService(id);
    const found=services.find(item=>item.id===id);
    const materialIds=[...new Set(linked.filter(item=>item.service_id===id).map(item=>item.material_id))];
    setMaterial(materialIds.length===1?materialIds[0]:"");
    setDetails(found?sourceDetails(found):blank);
    setTicket(found?.destination_tickets.length===1?found.destination_tickets[0]:"");
    setOriginGuide("");setTransferGuide("");setEntrySheet("");
  };
  const selectedService=services.find(item=>item.id===service);
  const guides=[...new Set([selectedService?.service_guide,...(selectedService?.control_guides??[])].filter((value):value is string=>Boolean(value)))];
  const ids=[...new Set(linked.filter(item=>item.service_id===service).map(item=>item.material_id))];
  const options=ids.length?materials.filter(item=>ids.includes(item.id)):materials;
  const applyReading=(values:Partial<Record<DocumentField,string>>)=>{
    setDetails(previous=>({...previous,...Object.fromEntries(Object.keys(blank).filter(key=>Object.hasOwn(values,key)).map(key=>[key,values[key as DocumentField]]))}));
    if(values.weighing_ticket!==undefined)setTicket(values.weighing_ticket);
    if(values.origin_guide!==undefined)setOriginGuide(values.origin_guide);
    if(values.transfer_guide!==undefined)setTransferGuide(values.transfer_guide);
    if(values.entry_sheet!==undefined)setEntrySheet(values.entry_sheet);
  };
  return <>
    <label>Cliente registrado<select name="client_id" required value={client} onChange={event=>{setClient(event.target.value);reset();}}><option value="">Seleccione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Forma de recepción<select name="receipt_mode" value={mode} onChange={event=>{setMode(event.target.value as "directa"|"programada");reset();}}><option value="directa">Directa de tercero, sin despacho RERCHAR</option><option value="programada">Vinculada a servicio RERCHAR</option></select></label>
    <label>Servicio RERCHAR (sólo recepción programada)<select name="service_id" value={service} disabled={mode!=="programada"} onChange={event=>chooseService(event.target.value)}><option value="">Sin vincular</option>{services.filter(item=>item.client_id===client).map(s=><option key={s.id} value={s.id}>{s.folio} · {s.client_name}</option>)}</select></label>
    <DocumentReader key={`${mode}:${client}:${service}:${material}`} sources={selectedService?.documents} onApply={applyReading} fields={["movement_on","driver_name","driver_tax_id","truck_plate","trailer_plate","origin","destination","weighing_ticket","origin_guide","transfer_guide","entry_sheet","supplier_kg","rerchar_kg","impurity_kg","net_reported_kg",...(!material?["material_name" as const]:[])]}/>
    <label>Material del catálogo<select name="material_id" value={material} onChange={event=>setMaterial(event.target.value)} required={ids.length>0}>
      <option value="">{ids.length?"Seleccione material de la solicitud":"Otro / pendiente de clasificar"}</option>
      {options.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}
    </select>{ids.length>0&&<small>La solicitud admite {ids.length} material{ids.length===1?"":"es"} del catálogo.</small>}</label>
    <label>Faena / lugar<input data-document-controlled name="site_name" value={details.site_name} onChange={event=>change("site_name",event.target.value)} required maxLength={180}/></label>
    <label>Origen<input data-document-controlled name="origin" value={details.origin} onChange={event=>change("origin",event.target.value)} maxLength={180}/></label>
    <label>Destino<input data-document-controlled name="destination" value={details.destination} onChange={event=>change("destination",event.target.value)} maxLength={180}/></label>
    <div className="form-section-title field-full">Transporte y carga</div>
    <label>Conductor<input data-document-controlled name="driver_name" value={details.driver_name} onChange={event=>change("driver_name",event.target.value)} maxLength={120}/></label>
    <label>RUT conductor<input data-document-controlled name="driver_tax_id" value={details.driver_tax_id} onChange={event=>change("driver_tax_id",event.target.value)} maxLength={25}/></label>
    <label>Camión<input data-document-controlled name="truck_plate" value={details.truck_plate} onChange={event=>change("truck_plate",event.target.value)} maxLength={20}/></label>
    <label>Rampla<input data-document-controlled name="trailer_plate" value={details.trailer_plate} onChange={event=>change("trailer_plate",event.target.value)} maxLength={30}/></label>
    <div className="form-section-title field-full">Documentos de recepción</div>
    {selectedService&&<div className="field-full receipt-source-references"><strong>Referencias del servicio {selectedService.folio}</strong>
      <p>Revise la guía física y seleccione la referencia que corresponda. Los tickets de origen y destino pueden ser distintos.</p>
      {guides.length>0&&<div><span>Guía registrada:</span>{guides.map(value=><button type="button" className="button button-outline" key={value} onClick={()=>setTransferGuide(value)}>{value} → traslado</button>)}</div>}
      {selectedService.origin_tickets.length>0&&<p>Ticket(s) de origen: {selectedService.origin_tickets.join(", ")}.</p>}
      {selectedService.destination_tickets.length>0&&<p>Ticket(s) de destino: {selectedService.destination_tickets.join(", ")}. {selectedService.destination_tickets.length>1&&"Seleccione el correspondiente al material recibido."}</p>}
    </div>}
    <label>Ticket de pesaje (opcional con guía u hoja)<input data-document-controlled name="weighing_ticket" value={ticket} onChange={event=>setTicket(event.target.value)} maxLength={80}/></label>
    {selectedService&&selectedService.destination_tickets.length>1&&<label>Elegir ticket de destino<select value={selectedService.destination_tickets.includes(ticket)?ticket:""} onChange={event=>setTicket(event.target.value)}><option value="">Seleccione para copiar</option>{selectedService.destination_tickets.map(value=><option key={value} value={value}>{value}</option>)}</select></label>}
    <label>Guía origen<input data-document-controlled name="origin_guide" value={originGuide} onChange={event=>setOriginGuide(event.target.value)} maxLength={80}/></label>
    <label>Guía de traslado<input data-document-controlled name="transfer_guide" value={transferGuide} onChange={event=>setTransferGuide(event.target.value)} maxLength={80}/></label>
    <label>Hoja de entrada<input data-document-controlled name="entry_sheet" value={entrySheet} onChange={event=>setEntrySheet(event.target.value)} maxLength={80}/></label>
    {selectedService&&<p className="helper-text field-full">Ruta y transporte se copiaron del servicio; el ticket de destino se propone sólo si es único. Confirme documentos y pesos con la recepción física antes de guardar.</p>}
  </>;
}
