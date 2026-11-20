import Link from "next/link";
import {notFound} from "next/navigation";
import {ArrowLeft,Weight} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {getService,PilotError} from "@/lib/pilot";
import {guideDifferences,guideValues,listGuideControls} from "@/lib/guides";
import ServiceGuideForm from "@/components/ServiceGuideForm";
import {guideControlFieldLimits,type GuideControlValues} from "@/lib/service-guide-state";
import {Notice} from "@/components/UI";
import PrintButton from "@/components/PrintButton";
import DocumentBrand from "@/components/DocumentBrand";
import CompanyScope from "@/components/CompanyScope";
import {companyName,serviceFolio} from "@/lib/companies";

const showKg=(n:number|null|string)=>n==null?"Pendiente":`${Number(n).toLocaleString("es-CL",{maximumFractionDigits:2})} kg`;
function day(value:Date|string){return new Intl.DateTimeFormat("es-CL",{timeZone:"UTC",dateStyle:"short"}).format(new Date(value));}
const money=(n:number|null)=>n==null?"Pendiente":`$${n.toLocaleString("es-CL")}`;
const iso=(value:Date|string|null)=>!value?"":value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
export default async function GuidePage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{error?:string;ok?:string;editar?:string}>}){
  const actor=await requireActor();
  const {id}=await params;
  let service;
  try{service=await getService(actor,id);}catch(error){if(error instanceof PilotError)notFound();throw error;}
  const [guides,query]=await Promise.all([listGuideControls(actor,id),searchParams]);
  const editing=guides.find(g=>g.id===query.editar);
  const guideDefaults:GuideControlValues=Object.fromEntries(Object.keys(guideControlFieldLimits).map(key=>{
    if(key==="control_id")return [key,editing?.id??""];
    if(key==="line_number")return [key,String(editing?.line_number??1)];
    if(key==="movement_type")return [key,editing?.movement_type??(service.request_category==="servicios"?"servicio":service.request_category)];
    if(key==="driver_name")return [key,editing?.driver_name??service.driver_name??""];
    if(key==="material_name")return [key,editing?.material_name??service.waste_type];
    const value=editing?.[key as keyof typeof editing];
    return [key,["movement_date","invoice_issued_on","payment_on"].includes(key)?iso(value as Date|string|null):String(value??"")];
  }));
  const guideFormKey=editing?editing.id+":"+new Date(editing.recorded_at).toISOString():"nuevo:"+guides.map(guide=>guide.id+":"+new Date(guide.recorded_at).toISOString()).join(",");
  const rental=service.service_type==="arriendo";
  if(rental&&!guides.length)return <><CompanyScope company={service.operating_company}/><Link href={`/solicitudes/${id}`} className="back-link"><ArrowLeft size={16}/> Volver al arriendo</Link>
    <section className="section-card"><h1>Control de guías y pesajes</h1><p>El arriendo se gestiona con su período y respaldos de ejecución. No requiere guía ni pesaje.</p>
      <Link className="button button-primary" href={`/solicitudes/${id}`}>Ver arriendo y adjuntar respaldo</Link></section></>;
  return <><CompanyScope company={service.operating_company}/>
    <div className="order-actions print-hide"><Link href={`/solicitudes/${id}`} className="back-link"><ArrowLeft size={16}/> Volver al servicio</Link>{service.operating_company&&(!rental||guides.length>0)&&<PrintButton label="Imprimir control / guardar PDF"/>}</div>
    {!service.operating_company&&<p role="alert" className="notice notice-error print-hide">Confirme la empresa operadora antes de imprimir este control.</p>}
    {rental&&<p role="status" className="helper-text print-hide">El arriendo se respalda con documentos de ejecución y no registra guía ni pesaje. Cualquier control anterior se conserva para revisión.</p>}
    <div className="print-hide"><Notice error={query.error} ok={query.ok}/></div>
    <article className="order-sheet" data-company={service.operating_company??"unassigned"}><header className="order-header"><div><DocumentBrand company={service.operating_company}/><div className="order-system">{companyName(service.operating_company)}</div><h1>Control de guías y pesajes</h1></div><div className="order-number"><small>SERVICIO</small><h1>{serviceFolio(service)}</h1></div></header>
      <div className="order-section"><div className="order-grid"><div><small>Cliente / faena</small><strong>{service.client_name} · {service.site_name}</strong></div><div><small>Ruta</small><strong>{service.origin} → {service.destination}</strong></div><div><small>Material</small><strong>{service.waste_type}</strong></div><div><small>Camión / conductor</small><strong>{service.asset_label??"Pendiente"} · {service.driver_name??"Pendiente"}</strong></div></div></div>
      {guides.map(guide=>{const d=guideDifferences(guide),v=guideValues(guide);return <div className="order-section" key={guide.id} id={"control-guia-"+guide.id} tabIndex={-1}><h2>Guía {guide.guide_number} · ítem {guide.line_number} · {day(guide.movement_date)} · {guide.movement_type}</h2>
        <div className="order-grid"><div><small>Chofer / patente</small><strong>{guide.driver_name||"—"} / {guide.truck_plate||"—"}</strong></div><div><small>Material</small><strong>{guide.material_name||"—"}</strong></div><div><small>Ticket faena / origen</small><strong>{guide.origin_ticket||"Pendiente"}</strong></div><div><small>Ticket salida</small><strong>{guide.departure_ticket||"—"}</strong></div><div><small>Peso desde faena</small><strong>{showKg(guide.origin_kg)}</strong></div><div><small>Peso agregado desde stock</small><strong>{showKg(guide.complementary_kg)}</strong></div><div><small>Salida total (faena + stock)</small><strong>{showKg(d.departure_kg)}</strong></div>
          <div><small>Ticket destino</small><strong>{guide.destination_ticket||"Pendiente"}</strong></div><div><small>Peso recibido en destino</small><strong>{showKg(guide.arrival_kg)}</strong></div><div><small>Impurezas / material devuelto</small><strong>{showKg(guide.returned_impurities_kg)}</strong></div><div><small>Diferencia destino - (salida - devuelto)</small><strong>{showKg(d.difference_kg)}</strong></div>
          <div><small>Ticket de retorno</small><strong>{guide.return_ticket||"Pendiente"}</strong></div><div><small>Peso del retorno</small><strong>{showKg(guide.return_weight_kg)}</strong></div><div><small>Impurezas descontadas en destino</small><strong>{showKg(guide.destination_impurities_kg)}</strong></div><div><small>Peso facturado</small><strong>{showKg(guide.invoice_kg)}</strong></div><div><small>Diferencia (destino - impurezas) - factura</small><strong>{showKg(d.invoice_difference_kg)}</strong></div><div><small>Factura / guía valorizada</small><strong>{guide.invoice_number||"—"} / {guide.valued_guide_number||"—"}</strong></div><div><small>Precio acordado / facturado por kg</small><strong>{money(guide.agreed_price_clp==null?null:Number(guide.agreed_price_clp))} / {money(guide.invoice_price_clp==null?null:Number(guide.invoice_price_clp))}</strong></div><div><small>Valor estimado / facturado</small><strong>{money(v.estimated_clp)} / {money(v.billed_clp)}</strong></div><div><small>Diferencia valorizada</small><strong>{money(v.variance_clp)}</strong></div><div><small>Factura emitida / pago</small><strong>{guide.invoice_issued_on?day(guide.invoice_issued_on):"—"} / {guide.payment_on?day(guide.payment_on):"—"}</strong></div><div><small>Transportista / factura flete</small><strong>{guide.freight_company||"—"} / {guide.freight_invoice_number||"—"}</strong></div><div><small>Guía flete / pago requerido</small><strong>{guide.freight_guide_reference||"—"} / {guide.freight_payment_required||"—"}</strong></div></div>
        {guide.notes&&<p>{guide.notes}</p>}{canManage(actor)&&<Link className="back-link print-hide" href={`/solicitudes/${id}/guias?editar=${guide.id}#editar`}>Editar este ítem</Link>}</div>})}
      {!guides.length&&<p className="order-muted">Aún no se registran guías con control de pesaje.</p>}
      <footer className="order-footer">Registro operativo interno · Las diferencias reflejan las fórmulas del control de guías de 2026.</footer>
    </article>
    {canManage(actor)&&!rental&&<section id="editar" className="section-card print-hide"><div className="section-heading"><div><div className="eyebrow">GUÍA DE TRASLADO / VALORIZACIÓN</div><h2><Weight size={19}/> {editing?`Actualizar guía ${editing.guide_number}, ítem ${editing.line_number}`:"Agregar un material a una guía"}</h2></div></div>
      <p className="helper-text">Registre un ítem por material y pesaje. Si una guía lleva más de un material, repita el número de guía e indique ítem 2, 3, etc. Para corregir un ítem use «Editar este ítem»; los campos vacíos conservan su valor anterior. Cada cambio queda auditado.</p>
      <ServiceGuideForm key={guideFormKey} id={id} defaults={guideDefaults}/></section>}
  </>;
}
