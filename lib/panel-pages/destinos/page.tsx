import Link from "next/link";
import {redirect} from "next/navigation";
import {MapPin} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {listQuoteDestinations} from "@/lib/destinations";
import {wasteCategories,facilityTypes,disposalUnits,categoryName} from "@/lib/destination-catalog";
import {createDestinationAction,updateDestinationAction} from "@/app/destination-actions";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";

function day(value:Date|string|null){return value?new Date(value).toISOString().slice(0,10):"";}
export default async function Destinations({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const [destinations,query]=await Promise.all([listQuoteDestinations(actor),searchParams]);
  return <><Link href="/cotizaciones" className="back-link">← Cotizaciones</Link><div className="page-title-row"><div><div className="eyebrow">MAESTRO COMERCIAL</div><h1>Destinos finales</h1><p className="page-intro">Plantas receptoras, compatibilidad de residuos y respaldo del gestor para cotizaciones.</p></div><span className="title-icon"><MapPin size={22}/></span></div>
    <Notice error={query.error} ok={query.ok}/>
    <p className="notice notice-error">Los destinos iniciales provienen de la planilla y están pendientes. Confirme datos, categorías recibidas y autorización vigente antes de habilitar cada uno.</p>
    <section className="section-card"><h2>Agregar destino</h2><form action={createDestinationAction} className="form-grid">
      <label className="field-full">Nombre de planta o receptor<input name="name" required minLength={3} maxLength={180}/></label>
      <label>Tipo de instalación<select name="facility_type" defaultValue="otro">{facilityTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
      <label>Comuna<input name="commune" maxLength={100}/></label><label className="field-full">Dirección / referencia vial<input name="address" maxLength={250}/></label>
      <label>Latitud<input name="latitude" type="number" step="0.000001" min="-90" max="90"/></label><label>Longitud<input name="longitude" type="number" step="0.000001" min="-180" max="180"/></label>
      <label className="field-full">Enlace de ubicación<input name="location_url" type="url" maxLength={500} placeholder="https://maps.google.com/..."/></label>
      <div className="field-full form-footer"><SubmitButton className="button button-primary">Agregar como pendiente</SubmitButton></div>
    </form></section>
    <section className="section-card"><h2>Destinos registrados · {destinations.length}</h2><div className="destination-list">{destinations.map(d=><details key={d.id} className="master-entry"><summary><span className="master-entry-name"><strong>{d.name}</strong><small>{d.commune||"Comuna pendiente"} · {d.status} · {d.accepted_categories.length?d.accepted_categories.map(categoryName).join(", "):"Sin residuos habilitados"}</small></span><span className="master-edit-hint">Configurar</span></summary>
      <form action={updateDestinationAction} className="form-grid"><input name="id" type="hidden" value={d.id}/>
        <label className="field-full">Nombre<input name="name" defaultValue={d.name} required minLength={3} maxLength={180}/></label>
        <label>Tipo de instalación<select name="facility_type" defaultValue={d.facility_type}>{facilityTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <label>Comuna<input name="commune" defaultValue={d.commune??""} maxLength={100}/></label><label className="field-full">Dirección / referencia vial<input name="address" defaultValue={d.address??""} maxLength={250}/></label>
        <label>Latitud<input name="latitude" type="number" step="0.000001" min="-90" max="90" defaultValue={d.latitude??""}/></label><label>Longitud<input name="longitude" type="number" step="0.000001" min="-180" max="180" defaultValue={d.longitude??""}/></label>
        <label className="field-full">Enlace de ubicación<input name="location_url" type="url" maxLength={500} defaultValue={d.location_url??""}/></label>
        <fieldset className="field-full"><legend>Residuos admitidos según autorización</legend><div className="destination-category-grid">{wasteCategories.map(c=><label className="check-row" key={c.value}><input type="checkbox" name="accepted_categories" value={c.value} defaultChecked={d.accepted_categories.includes(c.value)}/>{c.label}</label>)}</div></fieldset>
        <label className="field-full">Referencia de autorización / permiso<input name="authorization_reference" maxLength={180} defaultValue={d.authorization_reference??""}/></label>
        <label>Autorización vigente hasta<input name="authorization_valid_until" type="date" defaultValue={day(d.authorization_valid_until)}/></label>
        <label>Unidad de disposición<select name="disposal_unit" defaultValue={d.disposal_unit??""}><option value="">Seleccione</option>{disposalUnits.map(u=><option key={u.value} value={u.value}>{u.label}</option>)}</select></label>
        <label>Tarifa de disposición (CLP, puede ser 0)<input name="disposal_price_clp" type="number" step="0.01" min="0" defaultValue={d.disposal_price_clp??""}/></label>
        <label>Estado<select name="status" defaultValue={d.status}><option value="pendiente">Pendiente de validar</option><option value="habilitado">Habilitado</option><option value="suspendido">Suspendido</option></select></label>
        <label className="field-full">Respaldo de autorización (PDF, JPG o PNG; máximo 4 MB)<input type="file" name="authorization_document" accept=".pdf,.jpg,.jpeg,.png"/>{d.authorization_document_name&&<small className="table-sub">Actual: <a href={`/api/destinos/${d.id}/respaldo`}>{d.authorization_document_name}</a></small>}</label>
        <div className="field-full form-footer"><SubmitButton className="button button-primary">Guardar destino</SubmitButton></div>
      </form>{d.location_url&&<p className="helper-text"><a href={d.location_url} target="_blank" rel="noopener noreferrer">Abrir ubicación registrada ↗</a></p>}
    </details>)}</div></section>
  </>;
}
