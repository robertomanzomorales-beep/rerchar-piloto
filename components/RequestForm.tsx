"use client";

import { useState } from "react";
import { createServiceAction } from "@/app/actions";
import { SubmitButton } from "@/components/Transition";

type Client = { id: string; name: string };
type Site = { id: string; client_id: string; name: string };
export default function RequestForm({ clients, sites, clientId, submissionKey, quote }: { clients: Client[]; sites: Site[]; clientId?: string; submissionKey: string; quote?: {id:string;client_id:string;issuer:"rerchar"|"e_y_j";folio:string} }) {
  const [selected, setSelected] = useState(quote?.client_id ?? clientId ?? clients[0]?.id ?? "");
  const [category, setCategory] = useState("servicios");
  const available = sites.filter((site) => site.client_id === selected);
  return <form action={createServiceAction} className="form-grid">
    <input type="hidden" name="submission_key" value={submissionKey}/>
    <input type="hidden" name="quote_id" value={quote?.id??""}/>
    <div className="form-section-title">Datos del servicio</div>
    <label>Cliente<select name="client_id" value={selected} onChange={(event) => setSelected(event.target.value)} required disabled={Boolean(clientId||quote)}><option value="">Seleccione un cliente</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>{(clientId||quote) && <input type="hidden" name="client_id" value={selected}/>}</label>
    <label>Empresa que presta el servicio<select name="operating_company" defaultValue={quote?.issuer??""} required disabled={Boolean(quote)}><option value="">Seleccione la empresa</option><option value="rerchar">RERCHAR Chile SpA</option><option value="e_y_j">E y J Limitada</option></select>{quote&&<input type="hidden" name="operating_company" value={quote.issuer}/>}</label>
    {quote&&<p className="field-full helper-text">Esta solicitud proviene de la cotización {quote.folio}. Cliente y empresa se toman de la propuesta aceptada.</p>}
    <label>Centro o faena<select name="site_id" key={selected} required defaultValue=""><option value="">Seleccione un centro</option>{available.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}</select></label>
    <label>Tipo de solicitud<select name="request_category" value={category} onChange={(event)=>setCategory(event.target.value)} required><option value="servicios">Servicios</option><option value="compra">Compra</option><option value="venta">Venta</option><option value="otro">Otro</option></select></label>
    {category==="servicios"?<label>Operación<select name="service_type" defaultValue="retiro" required><option value="retiro">Retiro</option><option value="traslado">Traslado</option></select></label>:<input type="hidden" name="service_type" value={category}/>}
    <label>Residuo o material<input name="waste_type" maxLength={120} required placeholder="Ej. chatarra metálica"/></label>
    <label>Origen<input name="origin" maxLength={250} required placeholder="Lugar de retiro"/></label>
    <label>Destino<input name="destination" maxLength={250} required placeholder="Lugar de entrega"/></label>
    <label>Cantidad estimada (kg)<input name="estimated_kg" type="number" min="0.01" step="0.01" placeholder="Opcional"/></label>
    <label>Prioridad<select name="priority" defaultValue="normal"><option value="normal">Normal</option><option value="alta">Alta</option><option value="critica">Crítica</option></select></label>
    <label className="field-full">Observaciones<textarea name="notes" maxLength={2000} rows={4} placeholder="Indicaciones para la planificación, accesos u otras observaciones"/></label>
    <div className="field-full form-footer"><SubmitButton className="button button-primary">Registrar solicitud</SubmitButton></div>
  </form>;
}
