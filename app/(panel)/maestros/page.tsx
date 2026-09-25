import { redirect } from "next/navigation";
import Link from "next/link";
import { Boxes, Building2, MapPin, Truck, Users } from "lucide-react";
import { requireActor, canManage } from "@/lib/auth";
import { db } from "@/lib/db";
import { createAssetAction, createClientAction, createSiteAction, updateAssetAction, updateClientAction, updateSiteAction } from "@/app/actions";
import { Notice } from "@/components/UI";
import { SubmitButton } from "@/components/Transition";

export default async function Masters({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const actor = await requireActor();
  if (!canManage(actor)) redirect("/");
  const [clients, sites, assets, users] = await Promise.all([
    db.query<{ id: string; name: string; tax_id: string | null; contact_name:string|null;email:string|null;address:string|null }>("SELECT id,name,tax_id,contact_name,email,address FROM clients WHERE deleted_at IS NULL ORDER BY name"),
    db.query<{ id: string; name: string; address:string|null; client_id: string; client_name: string }>("SELECT cs.id, cs.name, cs.address, cs.client_id, c.name AS client_name FROM client_sites cs JOIN clients c ON c.id=cs.client_id WHERE cs.deleted_at IS NULL ORDER BY c.name, cs.name"),
    db.query<{ id: string; code: string; label: string; kind: string; plate: string | null }>("SELECT id,code,label,kind,plate FROM assets WHERE deleted_at IS NULL ORDER BY kind,label"),
    actor.role === "admin" ? db.query<{total:string}>("SELECT count(*)::text AS total FROM users WHERE active=true") : Promise.resolve([]),
  ]);
  const params = await searchParams;
  return <><div className="page-title-row"><div><div className="eyebrow">CONFIGURACIÓN BASE</div><h1>Maestros de operación</h1><p className="page-intro">Clientes, centros, activos y personas que se usarán en las solicitudes.</p></div><span className="title-icon"><Boxes size={24}/></span></div>
    <Notice error={params.error} ok={params.ok}/>
    <p className="helper-text">Puede corregir nombres, contactos, direcciones y patentes sin perder los servicios vinculados. La empresa de una faena y el código o tipo de un activo permanecen fijos para conservar la trazabilidad.</p>
    <div className="master-grid">
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">01 · CLIENTES</div><h2><Building2 size={19}/> Clientes</h2></div><span className="count-pill">{clients.length}</span></div>
        <form action={createClientAction} className="form-stack compact"><label>Razón social<input name="name" required maxLength={180}/></label><div className="two-fields"><label>RUT (opcional)<input name="tax_id" maxLength={20}/></label><label>Contacto (opcional)<input name="contact_name" maxLength={120}/></label></div><div className="two-fields"><label>Correo para cotizaciones<input name="email" type="email" maxLength={254}/></label><label>Dirección<input name="address" maxLength={250}/></label></div><SubmitButton className="button button-outline">Agregar cliente</SubmitButton></form>
        <ul className="record-list master-records">{clients.map((c) => <li key={c.id}>
          <details className="master-entry"><summary><span className="master-entry-name"><strong>{c.name}</strong><small>{[c.tax_id,c.contact_name,c.email].filter(Boolean).join(" · ")||"Sin datos de contacto"}</small></span><span className="master-edit-hint">Editar</span></summary>
            <form action={updateClientAction} className="form-stack compact"><input type="hidden" name="id" value={c.id}/><label>Razón social<input name="name" defaultValue={c.name} required minLength={2} maxLength={180}/></label><div className="two-fields"><label>RUT<input name="tax_id" defaultValue={c.tax_id??""} maxLength={20}/></label><label>Contacto<input name="contact_name" defaultValue={c.contact_name??""} maxLength={120}/></label></div><div className="two-fields"><label>Correo para cotizaciones<input name="email" type="email" defaultValue={c.email??""} maxLength={254}/></label><label>Dirección<input name="address" defaultValue={c.address??""} maxLength={250}/></label></div><Link href={`/clientes/${c.id}`} className="button button-outline">Ver carpeta del cliente</Link><SubmitButton className="button button-outline">Guardar cliente</SubmitButton></form>
          </details></li>)}{!clients.length && <li className="muted">Sin clientes registrados.</li>}</ul></section>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">02 · CENTROS</div><h2><MapPin size={19}/> Centros y faenas</h2></div><span className="count-pill">{sites.length}</span></div>
        <form action={createSiteAction} className="form-stack compact"><label>Cliente<select name="client_id" required defaultValue=""><option value="">Seleccione</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Nombre del centro<input name="name" required maxLength={180}/></label><label>Dirección (opcional)<input name="address" maxLength={250}/></label><SubmitButton className="button button-outline">Agregar centro</SubmitButton></form>
        <ul className="record-list master-records">{sites.map((s) => <li key={s.id}>
          <details className="master-entry"><summary><span className="master-entry-name"><strong>{s.name}</strong><small>{s.client_name}{s.address?` · ${s.address}`:""}</small></span><span className="master-edit-hint">Editar</span></summary>
            <form action={updateSiteAction} className="form-stack compact"><input type="hidden" name="id" value={s.id}/><p className="master-locked-field">Empresa: <strong>{s.client_name}</strong></p><label>Nombre del centro<input name="name" defaultValue={s.name} required minLength={2} maxLength={180}/></label><label>Dirección<input name="address" defaultValue={s.address??""} maxLength={250}/></label><SubmitButton className="button button-outline">Guardar faena</SubmitButton></form>
          </details></li>)}{!sites.length && <li className="muted">Sin centros registrados.</li>}</ul></section>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">03 · ACTIVOS</div><h2><Truck size={19}/> Flota y equipos</h2></div><span className="count-pill">{assets.length}</span></div>
        <form action={createAssetAction} className="form-stack compact"><div className="two-fields"><label>Código<input name="code" required maxLength={30} placeholder="CAM-01"/></label><label>Tipo<select name="kind" defaultValue="camion"><option value="camion">Camión</option><option value="rampa">Rampa</option><option value="equipo">Equipo</option></select></label></div><label>Descripción<input name="label" required maxLength={120}/></label><label>Patente (opcional)<input name="plate" maxLength={15}/></label><SubmitButton className="button button-outline">Agregar activo</SubmitButton></form>
        <ul className="record-list master-records">{assets.map((a) => <li key={a.id}>
          <details className="master-entry"><summary><span className="master-entry-name"><strong>{a.label}</strong><small>{a.code} · {a.kind}{a.plate ? ` · ${a.plate}` : ""}</small></span><span className="master-edit-hint">Editar</span></summary>
            <form action={updateAssetAction} className="form-stack compact"><input type="hidden" name="id" value={a.id}/><p className="master-locked-field">Código y tipo: <strong>{a.code} · {a.kind}</strong></p><label>Descripción<input name="label" defaultValue={a.label} required minLength={2} maxLength={120}/></label><label>Patente<input name="plate" defaultValue={a.plate??""} maxLength={15}/></label><SubmitButton className="button button-outline">Guardar activo</SubmitButton></form>
          </details></li>)}{!assets.length && <li className="muted">Sin activos registrados.</li>}</ul></section>
      {actor.role === "admin" && <section className="section-card"><div className="section-heading"><div><div className="eyebrow">04 · ACCESOS</div><h2><Users size={19}/> Usuarios y perfiles</h2></div><span className="count-pill">{users[0]?.total??"0"} activos</span></div>
        <p className="helper-text">Administre cuentas, claves y perfiles en un espacio dedicado. Las cuentas Cliente sólo consultan los datos de la empresa asignada.</p>
        <Link href="/usuarios" className="button button-outline">Administrar usuarios →</Link></section>}
    </div>
  </>;
}
