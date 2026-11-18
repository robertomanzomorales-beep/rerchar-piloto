"use client";

import type {ChangeEvent} from "react";
import type {CatalogMaterial} from "@/lib/material-stock";
import type {GuideDraft,GuideField} from "@/lib/material-guide-form-state";
export type GuideFieldBinder=(name:GuideField)=>{name:GuideField;value:string;onChange:(event:ChangeEvent<HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement>)=>void};
const weight=(name:GuideField,label:string,bind:GuideFieldBinder)=><label key={name}>{label}<input {...bind(name)} type="number" min="0" max="100000000" step="0.01"/></label>;

export function GuideHeaderFields({editing=false,clients,bind}:{editing?:boolean;clients:{id:string;name:string}[];bind:GuideFieldBinder}){
  return <>
    {!editing&&<><div className="form-section-title field-full">Identificación de la guía</div>
      <label>Número de guía<input {...bind("guide_number")} required maxLength={50} placeholder="Número del documento"/></label>
      <label>Operación<select {...bind("movement_type")}><option value="venta">Venta y salida de material</option><option value="compra">Compra de material</option><option value="traslado">Traslado</option></select></label></>}
    <label>Fecha de movimiento<input {...bind("movement_on")} type="date" required/></label>
    <label>Contraparte / empresa<select {...bind("counterparty_id")} required><option value="">Seleccione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Detalle de operación (planilla)<input {...bind("movement_detail")} maxLength={100} placeholder="Ej. VENTAS RT o VENTA DIRECTA"/></label>
    <label>Origen<input {...bind("origin")} required minLength={2} maxLength={250} placeholder="Faena o bodega"/></label>
    <label>Destino<input {...bind("destination")} required minLength={2} maxLength={250} placeholder="Comprador o planta"/></label>
    <label>Conductor<input {...bind("driver_name")} maxLength={120}/></label>
    <label>Patente camión<input {...bind("truck_plate")} maxLength={30}/></label>
    <label>Patente rampla<input {...bind("trailer_plate")} maxLength={30}/></label>
    <div className="form-section-title field-full">Flete asociado</div>
    <label>Transportista<input {...bind("freight_company")} maxLength={160}/></label>
    {weight("freight_cost_clp","Valor flete ($)",bind)}
    <label>Factura transportista<input {...bind("freight_invoice_number")} maxLength={80}/></label>
    <label>Guía transportista<input {...bind("freight_guide_reference")} maxLength={80}/></label>
    <label>¿Corresponde pago de flete?<select {...bind("freight_payment_required")}><option value="">Sin definir</option><option value="si">Sí</option><option value="no">No</option><option value="pendiente">Pendiente</option></select></label>
    <label>Estado factura flete<select {...bind("freight_invoice_status")}><option value="">Sin registrar</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagada">Pagada</option></select></label>
    <label className="field-full">Observaciones de la guía<textarea {...bind("guide_notes")} rows={2} maxLength={500}/></label>
  </>;
}

export function GuideItemFields({values,bind,catalog,billingLinked=false}:{values:GuideDraft;bind:GuideFieldBinder;catalog:CatalogMaterial[];billingLinked?:boolean}){
  const paid=values.invoice_status==="pagada";
  return <>
    <div className="form-section-title field-full">Material y salida</div>
    <label>Número de ítem<input {...bind("line_number")} type="number" min="1" max="100" step="1" required readOnly={Boolean(values.item_id)}/></label>
    <label>Material del catálogo<select {...bind("material_id")}><option value="">Otro / pendiente de clasificar</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.name} · {Number(m.quantity_kg).toLocaleString("es-CL")} kg disponibles</option>)}</select></label>
    <label>Nombre si no figura en el catálogo<input {...bind("material_name")} required={!values.material_id} minLength={2} maxLength={160} placeholder="Sólo para un material nuevo"/></label>
    <label>Ticket de faena<input {...bind("origin_ticket")} maxLength={80}/></label>
    {weight("origin_kg","Peso desde faena (kg)",bind)}{weight("stock_kg","Peso complementario desde stock (kg)",bind)}
    <label>Ticket de salida<input {...bind("departure_ticket")} maxLength={80}/></label>
    <div className="form-section-title field-full">Destino y devolución</div>
    <label>Ticket destino<input {...bind("destination_ticket")} maxLength={80}/></label>
    {weight("arrival_kg","Peso recibido en destino (kg)",bind)}{weight("returned_kg","Material devuelto (kg)",bind)}
    <label>Ticket de retorno<input {...bind("return_ticket")} maxLength={80}/></label>
    {weight("return_kg","Peso de retorno (kg)",bind)}
    <div className="form-section-title field-full">Factura y cobro</div>
    {billingLinked&&<p className="helper-text field-full">Factura vinculada: su folio, estado y pagos se administran en Cobranza. Los pesos y observaciones del material se pueden corregir aquí.</p>}
    {weight("destination_impurity_kg","Impureza descontada en destino (kg)",bind)}{weight("invoice_kg","Peso facturado (kg)",bind)}
    {weight("agreed_price_clp","Precio acordado ($/kg)",bind)}{weight("invoice_price_clp","Precio facturado ($/kg)",bind)}
    <label>Número factura<input {...bind("invoice_number")} maxLength={80} required={paid} readOnly={billingLinked}/></label>
    <label>Fecha factura<input {...bind("invoice_issued_on")} type="date" required={paid} readOnly={billingLinked}/></label>
    <label>Estado factura<select {...bind("invoice_status")} disabled={billingLinked}><option value="">Sin registrar</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagada">Pagada</option></select>{billingLinked&&<input type="hidden" name="invoice_status" value={values.invoice_status??""}/>}</label>
    <label>Fecha pago<input {...bind("payment_on")} type="date" min={values.invoice_issued_on||undefined} required={paid} readOnly={billingLinked}/></label>
    <label>Guía valorizada<input {...bind("valued_guide_number")} maxLength={80}/></label>
    <label className="field-full">Observaciones del material<textarea {...bind("notes")} rows={2} maxLength={500}/></label>
  </>;
}
