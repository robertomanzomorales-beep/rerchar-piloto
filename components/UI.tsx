import Link from "next/link";
import { ArrowUpRight, Clock3, ChevronRight } from "lucide-react";
import { statusName, type ServiceRow } from "@/lib/pilot";

export function chileDate(value: Date | string | null, withTime = true) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago", day: "2-digit", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(value));
}
export function Badge({ status }: { status: string }) {
  return <span className={`badge badge-${status}`}>{statusName[status] ?? status}</span>;
}
export function Notice({ error, ok }: { error?: string; ok?: string }) {
  if (error) return <div role="alert" className="notice notice-error">{error.slice(0, 240)}</div>;
  if (ok) return <div role="status" className="notice notice-success">Cambios guardados correctamente.</div>;
  return null;
}
export function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="empty-state"><Clock3 size={24}/><h3>{title}</h3><p>{detail}</p></div>;
}
export function ServiceTable({ services }: { services: ServiceRow[] }) {
  if (!services.length) return <Empty title="Sin solicitudes en esta vista" detail="Cree una solicitud o cambie los filtros para ver resultados."/>;
  return <div className="table-wrap"><table className="data-table"><thead><tr><th>Folio / cliente</th><th>Servicio</th><th>Planificación</th><th>Estado</th><th aria-label="Abrir"></th></tr></thead><tbody>{services.map((service) =>
    <tr key={service.id}><td><Link className="table-main" href={`/solicitudes/${service.id}`}>RER-{String(service.folio).padStart(5,"0")}</Link><span className="table-sub">{service.client_name}</span></td>
      <td><strong>{service.waste_type}</strong><span className="table-sub">{service.site_name} · {service.service_type}</span></td>
      <td>{service.scheduled_for ? chileDate(service.scheduled_for) : <span className="muted">Por programar</span>}</td>
      <td><Badge status={service.status}/></td>
      <td><Link href={`/solicitudes/${service.id}`} className="table-arrow" aria-label={`Abrir folio RER-${service.folio}`}><ArrowUpRight size={18}/></Link></td></tr>
  )}</tbody></table></div>;
}
export function Breadcrumb({ label }: { label: string }) {
  return <nav className="breadcrumb" aria-label="Ruta"><Link href="/solicitudes">Solicitudes</Link><ChevronRight size={14}/><span>{label}</span></nav>;
}
