import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, MapPin, Truck } from "lucide-react";
import { requireActor } from "@/lib/auth";
import { listAgenda, type AgendaService } from "@/lib/pilot";
import { Badge, chileDate } from "@/components/UI";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(date: Date, days: number) { const next = new Date(date); next.setUTCDate(next.getUTCDate() + days); return next; }
function weekStart(input?: string) {
  const todayChile = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const raw = input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? input : todayChile;
  const date = new Date(`${raw}T12:00:00Z`);
  const safe = !Number.isNaN(date.getTime()) && iso(date) === raw ? date : new Date(`${todayChile}T12:00:00Z`);
  return addDays(safe, -((safe.getUTCDay() + 6) % 7));
}

export default async function Agenda({ searchParams }: { searchParams: Promise<{ inicio?: string }> }) {
  const actor = await requireActor();
  const { inicio } = await searchParams;
  const monday = weekStart(inicio);
  const days = Array.from({ length: 7 }, (_, offset) => addDays(monday, offset));
  const next = addDays(monday, 7);
  const services = await listAgenda(actor, iso(monday), iso(next));
  const byDay = new Map<string, AgendaService[]>();
  const localDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" });
  for (const service of services) {
    const day = localDay.format(new Date(service.scheduled_for));
    byDay.set(day, [...(byDay.get(day) ?? []), service]);
  }
  return <>
    <div className="page-title-row"><div><div className="eyebrow">PLANIFICACIÓN</div><h1>Agenda de despacho</h1><p className="page-intro">Servicios programados y en ruta según el horario de Chile.</p></div><span className="title-icon"><CalendarDays size={24}/></span></div>
    <div className="agenda-controls"><Link href={`/agenda?inicio=${iso(addDays(monday,-7))}`} aria-label="Semana anterior"><ChevronLeft size={18}/> Anterior</Link><strong>{new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long" }).format(monday)} – {new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" }).format(days[6])}</strong><Link href={`/agenda?inicio=${iso(next)}`} aria-label="Semana siguiente">Siguiente <ChevronRight size={18}/></Link></div>
    <div className="agenda-grid">{days.map((day) => {
      const items = byDay.get(iso(day)) ?? [];
      return <section className="agenda-day" key={iso(day)}><header><span>{new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", weekday: "long" }).format(day)}</span><strong>{new Intl.DateTimeFormat("es-CL", { timeZone: "UTC", day: "2-digit", month: "2-digit" }).format(day)}</strong></header>
        {items.length ? <ul>{items.map((service) => <li key={service.id}><Link href={`/solicitudes/${service.id}`}><span className="agenda-item-head"><strong>RER-{String(service.folio).padStart(5,"0")}</strong><Badge status={service.status}/></span><span className="agenda-time">{chileDate(service.scheduled_for)}</span><b>{service.client_name}</b><span>{service.waste_type} · {service.site_name}</span><span className="agenda-detail"><MapPin size={13}/>{service.origin} → {service.destination}</span><span className="agenda-detail"><Truck size={13}/>{service.asset_label ?? "Camión pendiente"} · {service.driver_name ?? "Conductor pendiente"}</span></Link></li>)}</ul> : <p>Sin servicios programados.</p>}</section>;
    })}</div>
  </>;
}
