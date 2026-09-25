import Link from "next/link";
import { ArrowUpRight, ClipboardList, CalendarDays, Truck, CheckCircle2, Plus, ArrowRight, Wrench, AlertTriangle, ShoppingCart, Boxes, Container, Users, Banknote } from "lucide-react";
import { canManage, requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import { listFleet, listServices } from "@/lib/pilot";
import { ServiceTable } from "@/components/UI";

export default async function Dashboard() {
  const actor = await requireActor();
  const [services, counts, fleet, supply, continuity, finance] = await Promise.all([
    listServices(actor),
    db.query<{ status: string; total: string }>(
      `SELECT status, count(*)::text AS total FROM service_requests
       WHERE deleted_at IS NULL AND ($1::text <> 'cliente' OR client_id = $2::uuid)
       AND ($1::text <> 'conductor' OR driver_id = $3::uuid) GROUP BY status`,
      [actor.role, actor.client_id, actor.id],
    ),
    canManage(actor) ? listFleet(actor) : Promise.resolve(null),
    canManage(actor) ? db.query<{ approvals: string; arrivals: string; alerts: string }>(`SELECT
      (SELECT count(*)::text FROM purchase_requests WHERE status='solicitada') AS approvals,
      (SELECT count(*)::text FROM purchase_requests WHERE status IN ('ordenada','parcial')) AS arrivals,
      (SELECT count(*)::text FROM stock_items i CROSS JOIN warehouses w
       LEFT JOIN stock_balances b ON b.item_id=i.id AND b.warehouse_id=w.id
       WHERE i.active=true AND w.active=true AND COALESCE(b.quantity,0)-COALESCE(b.reserved,0)<=i.minimum_qty) AS alerts`) : Promise.resolve([]),
    canManage(actor) ? db.query<{work_orders:string;maintenance_due:string;containers_overdue:string;credentials_expiring:string}>(`SELECT
      (SELECT count(*)::text FROM work_orders WHERE status IN ('abierta','en_trabajo')) AS work_orders,
      (SELECT count(*)::text FROM maintenance_plans p JOIN assets a ON a.id=p.asset_id
       WHERE p.active=true AND a.deleted_at IS NULL AND
       ((p.frequency_kind='fecha' AND p.next_due_date <= (now() AT TIME ZONE 'America/Santiago')::date)
        OR (p.frequency_kind='lectura' AND a.current_reading >= p.next_due_reading))) AS maintenance_due,
      (SELECT count(*)::text FROM containers WHERE status='instalada'
       AND installed_at + (max_stay_days * interval '1 day') <= now()) AS containers_overdue,
      (SELECT count(*)::text FROM worker_credentials c JOIN site_requirements r ON r.id=c.requirement_id
       WHERE r.active=true AND c.state='verificada' AND c.expires_on <= (now() AT TIME ZONE 'America/Santiago')::date + r.warning_days) AS credentials_expiring`) : Promise.resolve([]),
    actor.role === "admin" ? db.query<{unvalued:string;invoices_due:string;outstanding_clp:string}>(`SELECT
      (SELECT count(*)::text FROM service_requests s LEFT JOIN service_valuations v ON v.service_id=s.id
       WHERE s.status='completada' AND s.deleted_at IS NULL AND v.id IS NULL) AS unvalued,
      (SELECT count(*)::text FROM service_invoices f WHERE f.status='emitida' AND f.due_on < (now() AT TIME ZONE 'America/Santiago')::date
       AND f.total_clp > COALESCE((SELECT sum(p.amount_clp) FROM invoice_payments p WHERE p.invoice_id=f.id),0)) AS invoices_due,
      (SELECT COALESCE(sum(f.total_clp-COALESCE((SELECT sum(p.amount_clp) FROM invoice_payments p WHERE p.invoice_id=f.id),0)),0)::text
       FROM service_invoices f WHERE f.status='emitida') AS outstanding_clp`) : Promise.resolve([]),
  ]);
  const count = (status: string) => Number(counts.find((entry) => entry.status === status)?.total ?? 0);
  const canCreate = actor.role !== "conductor";
  return <>
    <div className="page-title-row"><div><div className="eyebrow">PANEL OPERACIONAL</div><h1>Resumen de servicios</h1><p className="page-intro">Estado actual de las solicitudes y tareas de su perfil.</p></div>
      {canCreate && <Link href="/solicitudes/nueva" className="button button-primary"><Plus size={18}/> Nueva solicitud</Link>}</div>
    <div className="stat-grid">
      <Link href="/solicitudes?estado=solicitada" className="stat-card"><span className="stat-icon blue"><ClipboardList size={20}/></span><span className="stat-label">Por planificar</span><strong>{count("solicitada")}</strong><span className="stat-hint">Requieren asignación <ArrowUpRight size={15}/></span></Link>
      <Link href="/solicitudes?estado=programada" className="stat-card"><span className="stat-icon amber"><CalendarDays size={20}/></span><span className="stat-label">Programados</span><strong>{count("programada")}</strong><span className="stat-hint">Próximos servicios <ArrowUpRight size={15}/></span></Link>
      <Link href="/solicitudes?estado=en_ruta" className="stat-card"><span className="stat-icon teal"><Truck size={20}/></span><span className="stat-label">En ruta</span><strong>{count("en_ruta")}</strong><span className="stat-hint">En ejecución <ArrowUpRight size={15}/></span></Link>
      <Link href="/solicitudes?estado=completada" className="stat-card"><span className="stat-icon green"><CheckCircle2 size={20}/></span><span className="stat-label">Completados</span><strong>{count("completada")}</strong><span className="stat-hint">Con cierre registrado <ArrowUpRight size={15}/></span></Link>
    </div>
    {fleet && <section className="section-card fleet-dashboard"><div><div className="eyebrow">CONTINUIDAD OPERACIONAL</div><h2><Wrench size={19}/> Estado de flota</h2><p>{fleet.assets.filter((asset) => asset.available).length} activos disponibles · {fleet.assets.filter((asset) => !asset.available).length} detenidos</p>{fleet.incidents.length > 0 && <span className="fleet-warning"><AlertTriangle size={16}/>{fleet.incidents.length} avería(s) abierta(s) requieren revisión</span>}</div><Link href="/flota" className="button button-outline">Ver flota y averías <ArrowRight size={16}/></Link></section>}
    {continuity[0] && <section className="section-card fleet-dashboard"><div><div className="eyebrow">MANTENIMIENTO Y RECURSOS</div><h2><Wrench size={19}/> Continuidad diaria</h2><p>{continuity[0].work_orders} órdenes abiertas · {continuity[0].maintenance_due} planes vencidos</p><p><Container size={16}/> {continuity[0].containers_overdue} contenedores superan la permanencia definida · <Users size={16}/> {continuity[0].credentials_expiring} acreditaciones verificadas por vencer o vencidas</p></div><div className="supply-dashboard-links"><Link href="/mantenimiento" className="button button-outline">Órdenes <ArrowRight size={16}/></Link><Link href="/contenedores" className="button button-outline">Contenedores <ArrowRight size={16}/></Link><Link href="/personal" className="button button-outline">Personal <ArrowRight size={16}/></Link></div></section>}
    {supply[0] && <section className="section-card fleet-dashboard"><div><div className="eyebrow">ABASTECIMIENTO E INVENTARIO</div><h2><ShoppingCart size={19}/> Compras y existencias</h2><p>{supply[0].approvals} compras por aprobar · {supply[0].arrivals} pedidos en recepción</p>{Number(supply[0].alerts) > 0 && <span className="fleet-warning"><Boxes size={16}/>{supply[0].alerts} artículo(s) por bodega requieren reposición</span>}</div><div className="supply-dashboard-links"><Link href="/compras" className="button button-outline">Compras <ArrowRight size={16}/></Link><Link href="/inventario" className="button button-outline">Inventario <ArrowRight size={16}/></Link></div></section>}
    {finance[0] && <section className="section-card fleet-dashboard"><div><div className="eyebrow">CONTROL ECONÓMICO</div><h2><Banknote size={19}/> Valorización y cobranza</h2><p>{finance[0].unvalued} servicios cerrados sin valorizar · {finance[0].invoices_due} facturas internas vencidas con saldo</p><p>Saldo por cobrar registrado: ${Number(finance[0].outstanding_clp).toLocaleString("es-CL")} CLP</p></div><Link href="/finanzas" className="button button-outline">Ver finanzas <ArrowRight size={16}/></Link></section>}
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">ACTIVIDAD</div><h2>Solicitudes recientes</h2></div><Link href="/solicitudes" className="text-link">Ver todas <ArrowRight size={16}/></Link></div><ServiceTable services={services.slice(0, 8)}/></section>
  </>;
}
