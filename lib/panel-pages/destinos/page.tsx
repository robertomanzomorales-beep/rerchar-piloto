import Link from "next/link";
import {redirect} from "next/navigation";
import {MapPin} from "lucide-react";
import {requireActor,canManage} from "@/lib/auth";
import {listQuoteDestinations} from "@/lib/destinations";
import {categoryName,destinationAvailability} from "@/lib/destination-catalog";
import {destinationContext,destinationId} from "@/lib/destination-form-state";
import DestinationForm from "@/components/DestinationForm";

type Query={empresa?:string;formulario?:string;destino?:string;ok?:string;guardado?:string};
export default async function Destinations({searchParams}:{searchParams:Promise<Query>}){
  const actor=await requireActor();if(!canManage(actor))redirect("/");
  const [destinations,query]=await Promise.all([listQuoteDestinations(actor),searchParams]);
  const context=destinationContext(query),selected=destinationId(query.destino),saved=destinationId(query.guardado);
  const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
  const statuses=destinations.map(destination=>destinationAvailability(destination,today));
  return <div className="destination-admin"><Link href={`/cotizaciones${context.empresa?`?empresa=${context.empresa}`:""}`} className="back-link">Volver a cotizaciones</Link><div className="page-title-row"><div><div className="eyebrow">MAESTRO COMERCIAL</div><h1>Destinos finales</h1><p className="page-intro">Plantas receptoras, residuos admitidos y autorizaciones para cotizar. Catálogo compartido por ambas empresas.</p></div><span className="title-icon"><MapPin size={22}/></span></div>
    {query.ok==="1"&&saved&&<p className="notice notice-success" role="status">Destino guardado correctamente.</p>}
    <p className="destination-guidance">Confirme la autorización vigente y los residuos admitidos antes de habilitar un destino. La vigencia también se comprueba al entregar la cotización.</p>
    <section className="section-card"><DestinationForm key={`create-${saved}`} kind="create" context={context} open={query.formulario==="create"&&!saved}/></section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CATÁLOGO DE RECEPTORES</div><h2>Destinos registrados</h2></div><span className="count-pill">{destinations.length}</span></div>
      <p className="helper-text" data-destination-count>{statuses.filter(status=>status.tone==="ready").length} habilitados · {statuses.filter(status=>status.tone==="pending").length} pendientes de validar · {statuses.filter(status=>status.tone==="expired").length} con autorización por revisar · {statuses.filter(status=>status.tone==="suspended").length} suspendidos</p>
      <div className="destination-list">{destinations.map((d,index)=>{const status=statuses[index];return <details key={`${d.id}-${selected===d.id?saved:""}`} id={`destino-${d.id}`} className="master-entry destination-entry" data-destination-row={d.id} open={selected===d.id}>
        <summary><span className="master-entry-name"><strong>{d.name}</strong><small>{d.commune||"Comuna pendiente"} · {d.accepted_categories.length?d.accepted_categories.map(categoryName).join(", "):"Sin residuos habilitados"}</small></span><span className={`destination-status destination-status--${status.tone}`}>{status.label}</span><span className="master-edit-hint">Configurar</span></summary>
        <DestinationForm kind="update" context={context} destination={d}/>
        {d.location_url&&<p className="helper-text"><a href={d.location_url} target="_blank" rel="noopener noreferrer">Abrir ubicación registrada</a></p>}
      </details>;})}</div>
      {!destinations.length&&<p className="muted">Todavía no hay destinos registrados. Agregue uno para completar su autorización y categorías.</p>}
    </section>
  </div>;
}
