import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft,Weight} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {getService,PilotError} from "@/lib/pilot";
import {guideDifferences,listGuideControls} from "@/lib/guides";
import {saveGuideControlAction} from "@/app/guide-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import PrintButton from "@/components/PrintButton";

const showKg=(n:number|null|string)=>n==null?"Pendiente":`${Number(n).toLocaleString("es-CL",{maximumFractionDigits:2})} kg`;
function day(value:Date|string){return new Intl.DateTimeFormat("es-CL",{timeZone:"UTC",dateStyle:"short"}).format(new Date(value));}
export default async function GuidePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();
  const {id}=await params;
  let service;
  try{service=await getService(actor,id);}catch(error){if(error instanceof PilotError)notFound();throw error;}
  const [guides,query]=await Promise.all([listGuideControls(actor,id),searchParams]);
  return <>
    <div className="order-actions print-hide"><Link href={`/solicitudes/${id}`} className="back-link"><ArrowLeft size={16}/> Volver al servicio</Link><PrintButton label="Imprimir control / guardar PDF"/></div>
    <div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <article className="order-sheet"><header className="order-header"><div><div className="order-system">RERCHAR CHILE SPA</div><h1>Control de guías y pesajes</h1></div><div className="order-number"><small>SERVICIO</small><h1>RER-{String(service.folio).padStart(5,"0")}</h1></div></header>
      <div className="order-section"><div className="order-grid"><div><small>Cliente / faena</small><strong>{service.client_name} · {service.site_name}</strong></div><div><small>Ruta</small><strong>{service.origin} → {service.destination}</strong></div><div><small>Material</small><strong>{service.waste_type}</strong></div><div><small>Camión / conductor</small><strong>{service.asset_label??"Pendiente"} · {service.driver_name??"Pendiente"}</strong></div></div></div>
      {guides.map(guide=>{const d=guideDifferences(guide);return <div className="order-section" key={guide.id}><h2>Guía {guide.guide_number} · {day(guide.movement_date)} · {guide.movement_type}</h2>
        <div className="order-grid"><div><small>Ticket faena / origen</small><strong>{guide.origin_ticket||"Pendiente"}</strong></div><div><small>Peso desde faena</small><strong>{showKg(guide.origin_kg)}</strong></div><div><small>Peso agregado desde stock</small><strong>{showKg(guide.complementary_kg)}</strong></div><div><small>Salida total (faena + stock)</small><strong>{showKg(d.departure_kg)}</strong></div>
          <div><small>Ticket destino</small><strong>{guide.destination_ticket||"Pendiente"}</strong></div><div><small>Peso recibido en destino</small><strong>{showKg(guide.arrival_kg)}</strong></div><div><small>Impurezas / material devuelto</small><strong>{showKg(guide.returned_impurities_kg)}</strong></div><div><small>Diferencia destino - (salida - devuelto)</small><strong>{showKg(d.difference_kg)}</strong></div>
          <div><small>Ticket de retorno</small><strong>{guide.return_ticket||"Pendiente"}</strong></div><div><small>Peso del retorno</small><strong>{showKg(guide.return_weight_kg)}</strong></div><div><small>Impurezas descontadas en destino</small><strong>{showKg(guide.destination_impurities_kg)}</strong></div><div><small>Peso facturado</small><strong>{showKg(guide.invoice_kg)}</strong></div><div><small>Diferencia (destino - impurezas) - factura</small><strong>{showKg(d.invoice_difference_kg)}</strong></div><div><small>Factura / guía valorizada</small><strong>{guide.invoice_number||"—"} / {guide.valued_guide_number||"—"}</strong></div></div>
        {guide.notes&&<p>{guide.notes}</p>}</div>})}
      {!guides.length&&<p className="order-muted">Aún no se registran guías con control de pesaje.</p>}
      <footer className="order-footer">Registro operativo interno · Las diferencias reflejan las fórmulas del control de guías de 2026.</footer>
    </article>
    {canManage(actor)&&<section className="section-card print-hide"><div className="section-heading"><div><div className="eyebrow">GUÍA DE TRASLADO / VALORIZACIÓN</div><h2><Weight size={19}/> Agregar o actualizar un control</h2></div></div>
      <p className="helper-text">Una fila por guía. Para corregir una guía registrada, use su mismo número; se conservará la auditoría. Deje vacías las etapas aún pendientes.</p>
      <form action={saveGuideControlAction} className="form-grid"><input type="hidden" name="service_id" value={id}/>
        <label>Número de guía<input name="guide_number" required maxLength={50}/></label><label>Fecha<input name="movement_date" type="date" required/></label>
        <label>Operación<select name="movement_type" defaultValue={service.request_category==="servicios"?"servicio":service.request_category}><option value="servicio">Servicio</option><option value="compra">Compra</option><option value="venta">Venta</option><option value="traslado">Traslado</option><option value="otro">Otro</option></select></label>
        <div className="form-section-title field-full">Salida de origen</div><label>Ticket faena<input name="origin_ticket" maxLength={80}/></label><label>Peso desde faena (kg)<input name="origin_kg" type="number" min="0" step="0.01"/></label><label>Peso complementario desde stock (kg)<input name="complementary_kg" type="number" min="0" step="0.01"/></label>
        <div className="form-section-title field-full">Llegada y retorno</div><label>Ticket destino<input name="destination_ticket" maxLength={80}/></label><label>Peso recibido en destino (kg)<input name="arrival_kg" type="number" min="0" step="0.01"/></label><label>Impurezas / material devuelto (kg)<input name="returned_impurities_kg" type="number" min="0" step="0.01"/></label><label>Ticket retorno<input name="return_ticket" maxLength={80}/></label><label>Peso de retorno (kg)<input name="return_weight_kg" type="number" min="0" step="0.01"/></label>
        <div className="form-section-title field-full">Factura y respaldo</div><label>Impureza descontada por destino (kg)<input name="destination_impurities_kg" type="number" min="0" step="0.01"/></label><label>Peso factura (kg)<input name="invoice_kg" type="number" min="0" step="0.01"/></label><label>Número factura<input name="invoice_number" maxLength={80}/></label><label>Guía valorizada<input name="valued_guide_number" maxLength={80}/></label><label className="field-full">Observaciones<textarea name="notes" maxLength={500} rows={3}/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar control de guía</SubmitButton></div>
      </form></section>}
  </>;
}
