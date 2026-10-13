import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { getService, PilotError } from "@/lib/pilot";
import { Badge, chileDate } from "@/components/UI";
import PrintButton from "@/components/PrintButton";
import {companyName,serviceFolio} from "@/lib/companies";

export default async function ServiceOrder({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireActor();
  const { id } = await params;
  let service;
  try { service = await getService(actor, id); }
  catch (error) { if (error instanceof PilotError) notFound(); throw error; }
  const [check] = await db.query<{ vehicle_ok: boolean; documents_ok: boolean; containment_ok: boolean; ppe_ok: boolean; comment: string | null }>(
    "SELECT vehicle_ok,documents_ok,containment_ok,ppe_ok,comment FROM service_checklists WHERE service_id=$1", [id],
  );
  const folio = serviceFolio(service);
  return <>
    <div className="order-actions print-hide"><Link href={`/solicitudes/${id}`} className="back-link"><ArrowLeft size={16}/> Volver al servicio</Link>{service.operating_company&&<PrintButton/>}</div>
    {!service.operating_company&&<p role="alert" className="notice notice-error print-hide">Confirme primero la empresa operadora para imprimir la orden.</p>}
    <article className="order-sheet">
      <header className="order-header"><div>{service.operating_company==="rerchar"&&<Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={2124} height={740} className="order-logo"/>}<div className="order-system">{companyName(service.operating_company)}</div></div><div className="order-number"><small>ORDEN DE SERVICIO · PILOTO</small><h1>{folio}</h1><Badge status={service.status}/></div></header>
      <div className="order-section"><h2>Solicitud y cliente</h2><div className="order-grid"><div><small>Cliente</small><strong>{service.client_name}</strong></div><div><small>Centro o faena</small><strong>{service.site_name}</strong></div><div><small>Servicio</small><strong className="capitalize">{service.service_type}</strong></div><div><small>Residuo o material</small><strong>{service.waste_type}</strong></div><div><small>Origen</small><strong>{service.origin}</strong></div><div><small>Destino</small><strong>{service.destination}</strong></div><div><small>Cantidad estimada</small><strong>{service.estimated_kg ? `${Number(service.estimated_kg).toLocaleString("es-CL")} kg` : "Sin estimación"}</strong></div><div><small>Prioridad</small><strong className="capitalize">{service.priority}</strong></div></div></div>
      <div className="order-section"><h2>Programación y despacho</h2><div className="order-grid"><div><small>Fecha y hora (Chile)</small><strong>{chileDate(service.scheduled_for)}</strong></div><div><small>Camión</small><strong>{service.asset_label ?? "Pendiente"}</strong></div><div><small>Rampla</small><strong>{service.ramp_label ?? "Sin rampla"}</strong></div><div><small>Conductor</small><strong>{service.driver_name ?? "Pendiente"}</strong></div>{service.external_driver_id&&<><div><small>RUT conductor tercero</small><strong>{service.external_driver_tax_id}</strong></div><div><small>Transportista</small><strong>{service.external_driver_company}</strong></div></>}{service.guide_number&&<div><small>Número de guía recibido</small><strong>{service.guide_number}</strong></div>}</div></div>
      {service.notes && <div className="order-section"><h2>Observaciones</h2><p>{service.notes}</p></div>}
      <div className="order-section"><h2>Control previo</h2>{check ? <div className="order-check-grid">{[["Vehículo inspeccionado", check.vehicle_ok], ["Documentos revisados", check.documents_ok], ["Contención verificada", check.containment_ok], ["Elementos de protección", check.ppe_ok]].map(([label, done]) => <div key={String(label)}><span>{done ? "✓" : "○"}</span>{label}</div>)}{check.comment && <p className="order-check-comment">{check.comment}</p>}</div> : <p className="order-muted">Checklist pendiente de completar.</p>}</div>
      {service.status === "completada" && <div className="order-section"><h2>Pesaje de cierre</h2><div className="order-grid"><div><small>Peso bruto</small><strong>{Number(service.gross_kg).toLocaleString("es-CL")} kg</strong></div><div><small>Tara</small><strong>{Number(service.tare_kg).toLocaleString("es-CL")} kg</strong></div><div><small>Peso neto</small><strong>{(Number(service.gross_kg) - Number(service.tare_kg)).toLocaleString("es-CL")} kg</strong></div></div></div>}
      <footer className="order-footer"><span>Orden generada desde el piloto · {companyName(service.operating_company)} · {chileDate(new Date())}</span><span>{folio}</span></footer>
    </article>
  </>;
}
