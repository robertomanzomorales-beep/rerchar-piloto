import type {MaterialGuide,MaterialGuideItem} from "@/lib/material-guides";

const iso=(value:Date|string|null|undefined)=>!value?"":value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const weight=(name:string,label:string,value?:string|null)=><label key={name}>{label}<input type="number" name={name} min="0" step="0.01" defaultValue={value??""}/></label>;

export function GuideHeaderFields({guide,clients,today}:{guide?:MaterialGuide;clients:{id:string;name:string}[];today:string}){
  return <>
    {!guide&&<><div className="form-section-title field-full">Identificación de la guía</div>
      <label>Número de guía<input name="guide_number" required maxLength={50} placeholder="Número del documento"/></label>
      <label>Operación<select name="movement_type" defaultValue="venta"><option value="venta">Venta y salida de material</option><option value="compra">Compra de material</option><option value="traslado">Traslado</option></select></label></>}
    <label>Fecha de movimiento<input name="movement_on" type="date" required defaultValue={iso(guide?.movement_on)||today}/></label>
    <label>Contraparte / empresa<select name="counterparty_id" required defaultValue={guide?.counterparty_id??""}><option value="">Seleccione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Detalle de operación (planilla)<input name="movement_detail" maxLength={100} defaultValue={guide?.movement_detail??""} placeholder="Ej. VENTAS RT o VENTA DIRECTA"/></label>
    <label>Origen<input name="origin" required maxLength={250} defaultValue={guide?.origin??""} placeholder="Faena o bodega"/></label>
    <label>Destino<input name="destination" required maxLength={250} defaultValue={guide?.destination??""} placeholder="Comprador o planta"/></label>
    <label>Conductor<input name="driver_name" maxLength={120} defaultValue={guide?.driver_name??""}/></label>
    <label>Patente camión<input name="truck_plate" maxLength={30} defaultValue={guide?.truck_plate??""}/></label>
    <label>Patente rampla<input name="trailer_plate" maxLength={30} defaultValue={guide?.trailer_plate??""}/></label>
    <div className="form-section-title field-full">Flete asociado</div>
    <label>Transportista<input name="freight_company" maxLength={160} defaultValue={guide?.freight_company??""}/></label>
    {weight("freight_cost_clp","Valor flete ($)",guide?.freight_cost_clp)}
    <label>Factura transportista<input name="freight_invoice_number" maxLength={80} defaultValue={guide?.freight_invoice_number??""}/></label>
    <label>Guía transportista<input name="freight_guide_reference" maxLength={80} defaultValue={guide?.freight_guide_reference??""}/></label>
    <label>¿Corresponde pago de flete?<select name="freight_payment_required" defaultValue={guide?.freight_payment_required??""}><option value="">Sin definir</option><option value="si">Sí</option><option value="no">No</option><option value="pendiente">Pendiente</option></select></label>
    <label>Estado factura flete<select name="freight_invoice_status" defaultValue={guide?.freight_invoice_status??""}><option value="">Sin registrar</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagada">Pagada</option></select></label>
    <label className="field-full">Observaciones de la guía<textarea name="guide_notes" rows={2} maxLength={500} defaultValue={guide?.notes??""}/></label>
  </>;
}

export function GuideItemFields({item,lineNumber=1}:{item?:MaterialGuideItem;lineNumber?:number}){
  return <>
    <div className="form-section-title field-full">Material y salida</div>
    <label>Número de ítem<input name="line_number" type="number" min="1" max="100" step="1" required readOnly={!!item} defaultValue={item?.line_number??lineNumber}/></label>
    <label>Material<input name="material_name" required maxLength={160} defaultValue={item?.material_name??""}/></label>
    <label>Ticket de faena<input name="origin_ticket" maxLength={80} defaultValue={item?.origin_ticket??""}/></label>
    {weight("origin_kg","Peso desde faena (kg)",item?.origin_kg)}
    {weight("stock_kg","Peso complementario desde stock (kg)",item?.stock_kg)}
    <label>Ticket de salida<input name="departure_ticket" maxLength={80} defaultValue={item?.departure_ticket??""}/></label>
    <div className="form-section-title field-full">Destino y devolución</div>
    <label>Ticket destino<input name="destination_ticket" maxLength={80} defaultValue={item?.destination_ticket??""}/></label>
    {weight("arrival_kg","Peso recibido en destino (kg)",item?.arrival_kg)}
    {weight("returned_kg","Material devuelto (kg)",item?.returned_kg)}
    <label>Ticket de retorno<input name="return_ticket" maxLength={80} defaultValue={item?.return_ticket??""}/></label>
    {weight("return_kg","Peso de retorno (kg)",item?.return_kg)}
    <div className="form-section-title field-full">Factura y cobro</div>
    {weight("destination_impurity_kg","Impureza descontada en destino (kg)",item?.destination_impurity_kg)}
    {weight("invoice_kg","Peso facturado (kg)",item?.invoice_kg)}
    {weight("agreed_price_clp","Precio acordado ($/kg)",item?.agreed_price_clp)}
    {weight("invoice_price_clp","Precio facturado ($/kg)",item?.invoice_price_clp)}
    <label>Número factura<input name="invoice_number" maxLength={80} defaultValue={item?.invoice_number??""}/></label>
    <label>Fecha factura<input name="invoice_issued_on" type="date" defaultValue={iso(item?.invoice_issued_on)}/></label>
    <label>Estado factura<select name="invoice_status" defaultValue={item?.invoice_status??""}><option value="">Sin registrar</option><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagada">Pagada</option></select></label>
    <label>Fecha pago<input name="payment_on" type="date" defaultValue={iso(item?.payment_on)}/></label>
    <label>Guía valorizada<input name="valued_guide_number" maxLength={80} defaultValue={item?.valued_guide_number??""}/></label>
    <label className="field-full">Observaciones del material<textarea name="notes" rows={2} maxLength={500} defaultValue={item?.notes??""}/></label>
  </>;
}
