import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {MaterialError,getMaterialReceipt,materialAmounts} from "@/lib/materials";
import {listOperationFiles} from "@/lib/operation-files";
import {updateMaterialPaymentAction,updateMaterialReferencesAction,addOperationFileAction} from "@/app/operation-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import PrintButton from "@/components/PrintButton";
import {listMaterialCatalog,receiptStockPosting} from "@/lib/material-stock";
import {linkReceiptMaterialAction,postReceiptMaterialAction} from "@/app/material-stock-actions";
import {moduleReady} from "@/lib/schema-readiness";
import ModuleUnavailable from "@/components/ModuleUnavailable";

const format=(n:number|null)=>n==null?"—":n.toLocaleString("es-CL",{maximumFractionDigits:2});
const date=(v:Date|string|null)=>!v?"—":v instanceof Date?v.toISOString().slice(0,10):String(v).slice(0,10);
export default async function MaterialDetail({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor(),{id}=await params;
  if(!await moduleReady("ingresos"))return <ModuleUnavailable title="Ingreso de material" company="rerchar"/>;
  let r;try{r=await getMaterialReceipt(actor,id);}catch(e){if(e instanceof MaterialError)notFound();throw e;}
  const [files,query,catalog,posting]=await Promise.all([listOperationFiles(actor,"receipt",id),searchParams,
    canManage(actor)?listMaterialCatalog(actor):Promise.resolve([]),canManage(actor)?receiptStockPosting(actor,id):Promise.resolve(null)]);
  const calc=materialAmounts(r);
  const facts:[string,string|number|null|undefined][]=[
    ["Fecha",date(r.movement_on)],["Recepción",r.receipt_mode==="directa"?"Directa de tercero":r.receipt_mode==="programada"?"Vinculada a servicio":"Anterior, sin clasificar"],
    ["Ticket de pesaje",r.weighing_ticket],["Cliente / faena",`${r.client_name} · ${r.site_name}`],
    ["Origen / destino",`${r.origin||"—"} → ${r.destination||"—"}`],["Material",r.material_name],
    ["Conductor / RUT",`${r.driver_name||"—"} / ${r.driver_tax_id||"—"}`],["Camión / rampa",`${r.truck_plate||"—"} / ${r.trailer_plate||"—"}`],
    ["Peso proveedor",`${format(r.supplier_kg==null?null:Number(r.supplier_kg))} kg`],["Peso RERCHAR",`${format(r.rerchar_kg==null?null:Number(r.rerchar_kg))} kg`],
    ["Impurezas",`${format(Number(r.impurity_kg))} kg`],["Base de cálculo",r.net_basis],["Neto calculado",`${format(calc.net_kg)} kg`],
    ["Neto registrado",`${format(r.net_reported_kg==null?null:Number(r.net_reported_kg))} kg`],["Diferencia contra registro",`${format(calc.variance_kg)} kg`],
    ["Precio unitario",r.unit_price_clp==null?"—":`$${format(Number(r.unit_price_clp))} / kg`],["Total estimado",calc.total_clp==null?"—":`$${format(calc.total_clp)}`],
    ["Informe impurezas",r.impurity_report],["Guía origen",r.origin_guide],["Guía traslado",r.transfer_guide],
    ["Hoja ingreso",r.entry_sheet],["Guía valorizada",r.valued_guide],["Certificado",r.certificate_number],["Acta",r.act_number],
    ["Factura",r.invoice_number],["Estado de pago",r.payment_status],["Fecha de pago",date(r.paid_on)]];
  return <><div className="order-actions print-hide"><Link href="/ingresos" className="back-link">← Ingresos de material</Link><div className="order-actions"><Link href={`/ingresos/${id}/hoja`} className="button button-outline">Hoja de ingreso imprimible</Link><PrintButton label="Imprimir control / guardar PDF"/></div></div><div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <article className="order-sheet material-control-sheet"><header className="order-header"><div><div className="order-system">RERCHAR CHILE SPA</div><h1>{r.kind==="excedente"?"Control de excedentes":"Control de ingreso de material"}</h1></div><div className="order-number"><small>REFERENCIA</small><h1>{r.weighing_ticket||r.transfer_guide||r.origin_guide||r.entry_sheet}</h1></div></header>
      {r.service_id&&<p>Servicio: <Link href={`/solicitudes/${r.service_id}`}>RER-{String(r.service_folio).padStart(5,"0")}</Link></p>}
      <div className="order-section"><div className="order-grid">{facts.map(([label,value])=><div key={label}><small>{label}</small><strong>{value||"—"}</strong></div>)}</div></div>
      {r.notes&&<div className="order-section"><h2>Observaciones</h2><p>{r.notes}</p></div>}
      {files.length>0&&<div className="order-section"><h2>Respaldos adjuntos</h2><ul className="record-list">{files.map(f=><li key={f.id}><a href={`/api/archivos-operacion/${f.id}`}>{f.kind.replaceAll("_"," ")} · {f.filename}</a></li>)}</ul></div>}
      <footer className="order-footer">Pesos en kg. Documento operativo; el monto calculado no sustituye una factura.</footer></article>
    {canManage(actor)&&<><section className="section-card print-hide"><h2>Existencia comercial RERCHAR</h2>{posting?<p>Ingreso confirmado: <strong>{format(Number(posting.delta_kg))} kg de {posting.material_name}</strong> · asiento {posting.id.slice(0,8)}. <Link href="/materiales-stock">Ver movimientos</Link>.</p>:<><p className="helper-text">Este registro aún no aumenta stock. Confirme sólo material recibido físicamente que pasa a existencia de RERCHAR: se sumarán peso RERCHAR menos impurezas. Si la carga pertenece a un tercero o sigue en tránsito, déjela pendiente.</p>{!r.material_id&&<form action={linkReceiptMaterialAction} className="form-stack"><input type="hidden" name="receipt_id" value={id}/><label>Material del catálogo<select name="material_id" required defaultValue=""><option value="">Seleccione</option>{catalog.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label><SubmitButton className="button button-outline">Clasificar material</SubmitButton></form>}{r.material_id&&<form action={postReceiptMaterialAction}><input type="hidden" name="receipt_id" value={id}/><SubmitButton className="button button-primary">Confirmar ingreso de {format(Number(r.rerchar_kg||0)-Number(r.impurity_kg))} kg al stock</SubmitButton></form>}</>}</section><section className="section-card print-hide"><h2>Corregir referencias del ingreso</h2><form action={updateMaterialReferencesAction} className="form-stack"><input type="hidden" name="id" value={id}/><label>N° hoja de ingreso<input name="entry_sheet" defaultValue={r.entry_sheet??""} maxLength={80}/></label><label>Factura<input name="invoice_number" defaultValue={r.invoice_number??""} maxLength={80}/></label><SubmitButton className="button button-outline">Guardar referencias</SubmitButton></form></section><div className="supply-columns print-hide"><section className="section-card"><h2>Actualizar estado de pago</h2><form action={updateMaterialPaymentAction} className="form-stack"><input type="hidden" name="id" value={id}/><label>Estado<select name="payment_status" defaultValue={r.payment_status}><option value="pendiente">Pendiente</option><option value="parcial">Parcial</option><option value="pagado">Pagado</option><option value="no_aplica">No aplica</option></select></label><label>Fecha de pago<input name="paid_on" type="date" defaultValue={r.paid_on?date(r.paid_on):""}/></label><SubmitButton className="button button-outline">Guardar estado</SubmitButton></form></section>
      <section className="section-card"><h2>Adjuntar respaldo</h2><form action={addOperationFileAction} className="form-stack"><input type="hidden" name="target" value="receipt"/><input type="hidden" name="id" value={id}/><label>Tipo<select name="kind"><option value="guia">Guía</option><option value="hoja_ingreso">Hoja de ingreso</option><option value="ticket">Ticket</option><option value="informe_impurezas">Informe impurezas</option><option value="factura">Factura</option><option value="comprobante">Comprobante</option><option value="certificado">Certificado</option><option value="acta">Acta</option><option value="otro">Otro</option></select></label><label>Archivo PDF o imagen<input type="file" name="file" accept=".pdf,.jpg,.jpeg,.png,.webp" required/></label><SubmitButton className="button button-outline">Guardar archivo</SubmitButton></form></section></div></>}
  </>;
}
