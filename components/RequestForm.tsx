"use client";

import { useState } from "react";
import Link from "next/link";
import { createServiceAction } from "@/app/actions";
import { SubmitButton } from "@/components/Transition";
import {requestTypesFromQuote} from "@/lib/request-kind";

type Client = { id: string; name: string };
type Site = { id: string; client_id: string; name: string };
type AcceptedQuote = {id:string;client_id:string;issuer:"rerchar"|"e_y_j";folio:string;title:string;notes:string;kind:"general"|"compra_material";
  route:{pickup:string;destination:string}|null;
  lines:{description:string;quantity:string;unit:string;line_note:string|null;principal:string|null}[]};
export default function RequestForm({ clients, sites, materials, clientId, submissionKey, quote, canCreateSite, initialCategory="servicios", initialServiceType="traslado" }: { clients: Client[]; sites: Site[]; materials:{id:string;name:string}[]; clientId?: string; submissionKey: string; quote?: AcceptedQuote; canCreateSite:boolean; initialCategory?: "servicios"|"compra"|"venta"|"retiro"|"otro"; initialServiceType?: "traslado"|"arriendo" }) {
  const initialClient=quote?.client_id ?? clientId ?? clients[0]?.id ?? "";
  const [selected, setSelected] = useState(initialClient);
  const [siteId,setSiteId]=useState(()=>{const initial=sites.filter(site=>site.client_id===initialClient);return initial.length===1?initial[0].id:"";});
  const [newSiteName,setNewSiteName]=useState("");
  const [category, setCategory] = useState<string>(initialCategory);
  const [serviceType, setServiceType] = useState(initialServiceType);
  const [materialId,setMaterialId]=useState("");
  const rental=category==="servicios"&&serviceType==="arriendo";
  const available = sites.filter((site) => site.client_id === selected);
  const materialLines=quote?.lines.filter(line=>/^(kg|kilos?|kilogramos?)$/i.test(line.unit.trim()))??[];
  const materialNames=[...new Set(materialLines.map(line=>line.description))];
  const quotedFlows=[...new Set(quote?.lines.map(line=>line.principal).filter(Boolean)??[])];
  const permitted=quote?requestTypesFromQuote(quote.kind,quote.lines.map(line=>line.principal)):null;
  const serviceOptions=(["traslado","arriendo"] as const).filter(type=>!permitted||permitted.some(allowed=>allowed===type));
  const suggestedRoute=quotedFlows.length<=1&&initialServiceType!=="arriendo"?quote?.route:null;
  const summary=materialNames.join(", ");
  const suggestedMaterial=summary.length<=120?summary:materialNames.length?`Varios materiales · ver ${quote?.folio}`:"";
  return <form action={createServiceAction} className="form-grid">
    <input type="hidden" name="submission_key" value={submissionKey}/>
    <input type="hidden" name="quote_id" value={quote?.id??""}/>
    <div className="form-section-title">Cliente y empresa</div>
    <label>Cliente<select name="client_id" value={selected} onChange={(event) => {const next=event.target.value;setSelected(next);const found=sites.filter(site=>site.client_id===next);setSiteId(found.length===1?found[0].id:"");setNewSiteName("");}} required disabled={Boolean(clientId||quote)}><option value="">Seleccione un cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>{(clientId||quote) && <input type="hidden" name="client_id" value={selected}/>}</label>
    <label>Empresa que presta el servicio<select name="operating_company" defaultValue={quote?.issuer??""} required disabled={Boolean(quote)}><option value="">Seleccione la empresa</option><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select>{quote&&<input type="hidden" name="operating_company" value={quote.issuer}/>}</label>
    {quote&&<div className="field-full quote-source"><strong>Propuesta aceptada · <Link href={`/cotizaciones/${quote.id}`}>{quote.folio}</Link></strong><span>{quote.title}</span><p>Cliente, empresa y {quote.kind==="compra_material"?"materiales del catálogo":"alcance"} se vinculan al guardar. Revise el centro y la ruta.</p>{quotedFlows.length>1&&<p role="alert">La propuesta reúne operaciones distintas. Seleccione el tipo de esta solicitud y registre cada operación por separado con el mismo folio comercial.</p>}{suggestedRoute&&<p>Se proponen retiro y destino del recorrido revisado en la cotización. Confirme ambos antes de registrar.</p>}<ul>{quote.lines.map((line,i)=><li key={i}>{line.description} · {Number(line.quantity).toLocaleString("es-CL",{maximumFractionDigits:3})} {line.unit}{line.line_note&&` · ${line.line_note}`}</li>)}</ul>{quote.notes&&<p><strong>Condiciones:</strong> {quote.notes}</p>}</div>}
    <label>Centro o faena<select name="site_id" value={siteId} onChange={event=>{setSiteId(event.target.value);if(event.target.value)setNewSiteName("");}} required={!newSiteName}><option value="">{canCreateSite?"Nuevo centro / lugar de entrega":"Seleccione un centro"}</option>{available.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select>{!available.length&&!canCreateSite&&<span className="helper-text">Solicite a operaciones registrar un centro para este cliente.</span>}</label>
    {canCreateSite&&!siteId&&<><label>Nuevo centro o lugar de entrega<input name="new_site_name" value={newSiteName} onChange={event=>setNewSiteName(event.target.value)} required minLength={2} maxLength={180} placeholder="Ej. Bodega del cliente"/></label><label>Dirección del nuevo centro (opcional)<input name="new_site_address" maxLength={250}/></label><p className="field-full helper-text">El centro se creará para este cliente al guardar la solicitud y quedará disponible para futuras ventas y retiros.</p></>}
    <div className="form-section-title">Operación solicitada</div>
    <label>Tipo de solicitud<select value={category} onChange={(event)=>{const next=event.target.value;setCategory(next);if(next==="servicios"&&serviceOptions.length)setServiceType(serviceOptions[0]);}} required disabled={quote?.kind==="compra_material"}>{serviceOptions.length>0&&<option value="servicios">Servicios</option>}{(!quote||quote.kind==="compra_material")&&<option value="compra">Compra de material</option>}{!quote&&<option value="venta">Venta de material</option>}{(!quote||permitted?.some(type=>type==="retiro"))&&<option value="retiro">Retiro de material</option>}{!quote&&<option value="otro">Otro</option>}</select></label>
    <input type="hidden" name="request_category" value={category==="retiro"?"servicios":category}/>
    {category==="servicios"?<label>Servicio<select name="service_type" value={serviceType} onChange={(event)=>setServiceType(event.target.value as "traslado"|"arriendo")} required>{serviceOptions.includes("traslado")&&<option value="traslado">Traslado</option>}{serviceOptions.includes("arriendo")&&<option value="arriendo">Arriendo de equipo</option>}</select></label>:<input type="hidden" name="service_type" value={category}/>}
    {category==="compra"&&!quote&&<label>Material del catálogo<select name="material_id" required value={materialId} onChange={event=>setMaterialId(event.target.value)}><option value="">Seleccione según Entrada de material</option>{materials.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
    {category==="compra"&&!quote?<><input type="hidden" name="waste_type" value={materials.find(item=>item.id===materialId)?.name??""}/><p className="helper-text field-full">El peso se registra al recibir y pesar el material. Puede crear la solicitud sin kilos estimados.</p></>:<label>{rental?"Equipo o servicio en arriendo":"Residuo o material"}<input name="waste_type" list={quote?"quote-materials":undefined} defaultValue={suggestedMaterial} maxLength={120} required placeholder={rental?"Ej. excavadora con garra":"Ej. chatarra metálica"}/>{quote&&<datalist id="quote-materials">{materialNames.map(name=><option key={name} value={name.slice(0,120)}/>)}</datalist>}</label>}
    <div className="form-section-title">Recorrido y período</div>
    <label>{rental?"Lugar de entrega del equipo":"Origen"}<input name="origin" defaultValue={suggestedRoute?.pickup??""} maxLength={250} required placeholder={rental?"Lugar de entrega":"Lugar de retiro"}/></label>
    <label>{rental?"Lugar de uso del equipo":"Destino"}<input name="destination" defaultValue={suggestedRoute?.destination??""} maxLength={250} required placeholder={rental?"Faena o lugar de trabajo":"Lugar de entrega"}/></label>
    {rental&&<><label>Inicio del arriendo<input name="rental_from" type="date" required/></label><label>Término del arriendo<input name="rental_to" type="date" required/></label><p className="field-full helper-text">Registre el período acordado. El cierre se respalda con un documento; el arriendo no requiere pesaje.</p></>}
    {!rental&&category!=="compra"&&<label>Cantidad estimada (kg)<input name="estimated_kg" type="number" min="0.01" step="0.01" placeholder="Opcional"/></label>}
    <div className="form-section-title">Indicaciones para operaciones</div>
    <label>Prioridad<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
    <label className="field-full">Observaciones<textarea name="notes" defaultValue={quote?.notes??""} maxLength={2000} rows={4} placeholder="Indicaciones para la planificación, accesos u otras observaciones"/></label>
    <div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar solicitud</SubmitButton></div>
  </form>;
}
