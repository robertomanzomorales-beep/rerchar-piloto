import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { requireActor } from "@/lib/auth";
import { db } from "@/lib/db";
import RequestForm from "@/components/RequestForm";
import { Breadcrumb, Notice } from "@/components/UI";
import {getQuote,quoteFolio} from "@/lib/quotes";

export default async function NewRequest({ searchParams }: { searchParams: Promise<{ error?: string; cotizacion?: string; tipo?:string }> }) {
  const actor = await requireActor();
  if (actor.role === "conductor") redirect("/solicitudes");
  const [clients, sites] = await Promise.all([
    db.query<{ id: string; name: string }>("SELECT id, name FROM clients WHERE deleted_at IS NULL AND ($1::text <> 'cliente' OR id=$2::uuid) ORDER BY name", [actor.role, actor.client_id]),
    db.query<{ id: string; client_id: string; name: string }>("SELECT id, client_id, name FROM client_sites WHERE deleted_at IS NULL AND ($1::text <> 'cliente' OR client_id=$2::uuid) ORDER BY name", [actor.role, actor.client_id]),
  ]);
  const params = await searchParams;
  let quote: {id:string;client_id:string;issuer:"rerchar"|"e_y_j";folio:string;title:string;notes:string;lines:{description:string;quantity:string;unit:string}[]}|undefined;
  if(params.cotizacion){
    try{
      const detail=await getQuote(actor,params.cotizacion);
      if(detail.quote.status==="aceptada")quote={id:detail.quote.id,client_id:detail.quote.client_id,issuer:detail.quote.issuer,
        folio:quoteFolio(detail.quote),title:detail.quote.title,notes:detail.quote.notes??"",
        lines:detail.lines.map(line=>({description:line.description,quantity:line.quantity,unit:line.unit}))};
    }catch{/* El enlace inválido no determina cliente ni empresa. */}
  }
  const initialCategory=(["compra","venta","retiro","otro"].includes(params.tipo??"")?params.tipo:"servicios") as "servicios"|"compra"|"venta"|"retiro"|"otro";
  return <><Breadcrumb label="Nueva solicitud"/><div className="page-title-row"><div><div className="eyebrow">NUEVO REGISTRO</div><h1>Nueva solicitud</h1><p className="page-intro">Distinga Traslado y Arriendo en Servicios. Compra, Venta y Retiro tienen su propia opción.</p></div></div>
    <Notice error={params.error}/>{params.cotizacion&&!quote&&<p role="alert" className="notice notice-error">La cotización no está aceptada o no está disponible. La solicitud no se vinculará.</p>}<section className="section-card form-card">{clients.length && sites.length ? <RequestForm clients={clients} sites={sites} clientId={actor.role === "cliente" ? actor.client_id ?? undefined : undefined} submissionKey={randomUUID()} quote={quote} initialCategory={initialCategory} initialServiceType={params.tipo==="arriendo"?"arriendo":"traslado"}/> : <p>Antes de crear solicitudes, registre un cliente y su centro en Maestros.</p>}</section></>;
}
