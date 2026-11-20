import Link from "next/link";
import {notFound} from "next/navigation";
import {requireActor,canManage} from "@/lib/auth";
import {getService,PilotError} from "@/lib/pilot";
import {getServiceLedger,LedgerError} from "@/lib/service-ledger";
import {ledgerBackHref,ledgerContext,type LedgerContext,type LedgerValues} from "@/lib/service-ledger-state";
import {isFinanceId} from "@/lib/finance-catalog-state";
import {Notice} from "@/components/UI";
import ServiceLedgerForm from "@/components/ServiceLedgerForm";
import PrintButton from "@/components/PrintButton";
import DocumentBrand from "@/components/DocumentBrand";
import CompanyScope from "@/components/CompanyScope";
import {companyName,serviceFolio} from "@/lib/companies";
import {db} from "@/lib/db";

const date=(value:Date|string|null|undefined)=>!value?"":value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
const number=(value:string|null|undefined)=>value==null||value===""?"—":Number(value).toLocaleString("es-CL",{maximumFractionDigits:3});
type Query=LedgerContext&{error?:string;ok?:string;formulario?:string;guardado?:string};
export default async function ServiceFollowup({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Query>}){
  const actor=await requireActor(),{id}=await params;
  let s;try{s=await getService(actor,id);}catch(error){if(error instanceof PilotError)notFound();throw error;}
  let ledger;try{ledger=await getServiceLedger(actor,id);}catch(error){if(error instanceof LedgerError)notFound();throw error;}
  const {followup:f,commercial:c}=ledger,query=await searchParams,isEyj=s.operating_company==="e_y_j",context=ledgerContext(query),saved=isFinanceId(query.guardado)?query.guardado:"";
  const managers=!isEyj&&canManage(actor)?await db.query<{id:string;name:string}>("SELECT id,name FROM users WHERE active=true AND role IN ('admin','operaciones') ORDER BY name,id"):[];
  const guideDefaults:LedgerValues={dispatch_guide_status:f?.dispatch_guide_status??"",requested_on:date(f?.requested_on),due_on:date(f?.due_on),responsible_user_id:f?.responsible_user_id??"",received_on:date(f?.received_on),documents_sent_on:date(f?.documents_sent_on),notes:f?.notes??""};
  const commercialDefaults:LedgerValues={quote_reference:c?.quote_reference??"",quote_on:date(c?.quote_on),order_reference:c?.order_reference??"",order_on:date(c?.order_on),service_sheet:c?.service_sheet??"",eyj_guide:c?.eyj_guide??"",client_guide:c?.client_guide??"",sidrep:c?.sidrep??"",rental_days:c?.rental_days??"",quantity:c?.quantity??"",service_value_clp:c?.service_value_clp??"",notes:c?.notes??""};
  const details:[string,string,string][]=[
    ["client","Cliente / faena",`${s.client_name} · ${s.site_name}`],["route","Ruta",`${s.origin} → ${s.destination}`],
    ["quote_reference","Cotización",c?.quote_reference||"—"],["quote_on","Fecha de cotización",date(c?.quote_on)||"—"],
    ["order_reference","Orden de compra del cliente",c?.order_reference||"—"],["order_on","Fecha de la orden",date(c?.order_on)||"—"],
    ["service_sheet","Hoja de servicio",c?.service_sheet||"—"],["eyj_guide","Guía E y J",c?.eyj_guide||"—"],
    ["client_guide","Guía del cliente",c?.client_guide||"—"],["sidrep","SIDREP",c?.sidrep||"—"],
    ["rental_days","Días de arriendo",number(c?.rental_days)],["quantity","Cantidad",number(c?.quantity)],
    ["service_value_clp","Valor informado",c?.service_value_clp==null?"—":`$${Number(c.service_value_clp).toLocaleString("es-CL",{maximumFractionDigits:2})}`],
    ["dispatch_guide_status","Guía de despacho enviada",f?.dispatch_guide_status==="enviada"?"Sí":f?.dispatch_guide_status==="pendiente"?"Pendiente":f?.dispatch_guide_status==="no_aplica"?"No aplica":"Sin registrar"],
    ...(!isEyj?[["requested_on","Guía valorizada solicitada",date(f?.requested_on)||"—"],["due_on","Plazo acordado",date(f?.due_on)||"—"],
      ["responsible_name","Responsable",f?.responsible_name||"—"],["received_on","Recibida",date(f?.received_on)||"—"]] as [string,string,string][]:[]),
    ["documents_sent_on","Documentos enviados",date(f?.documents_sent_on)||"—"],
  ];
  return <div className="service-ledger-page"><CompanyScope company={s.operating_company}/><div className="order-actions print-hide"><Link href={`/solicitudes/${id}`} className="back-link">Volver al servicio</Link>{canManage(actor)&&!isEyj&&<Link href={ledgerBackHref(context)} className="text-link">Volver al seguimiento de guías</Link>}{s.operating_company&&<PrintButton prepare label="Imprimir ficha comercial / PDF"/>}</div>
    <div className="print-hide"><Notice error={query.error} ok={query.ok}/><p className="helper-text">La ficha muestra la última información guardada.</p></div>
    {!s.operating_company&&<p role="alert" className="notice notice-error print-hide">Confirme la empresa operadora antes de imprimir esta ficha.</p>}
    <article className="order-sheet service-ledger-sheet" data-company={s.operating_company??"unassigned"}><header className="order-header"><div><DocumentBrand company={s.operating_company}/><div className="order-system">{companyName(s.operating_company)}</div><h1>{isEyj?"Seguimiento comercial y documental":"Seguimiento del servicio y guías"}</h1></div><div className="order-number"><small>SERVICIO</small><h1>{serviceFolio(s)}</h1></div></header>
      <div className="order-section"><div className="order-grid">{details.map(([key,label,value])=><div key={key} data-ledger-field={key}><small>{label}</small><strong>{value}</strong></div>)}</div>
        {c?.notes&&<p className="service-ledger-note">Comercial: {c.notes}</p>}{f?.notes&&<p className="service-ledger-note">Seguimiento: {f.notes}</p>}</div>
      <footer className="order-footer">Control operativo de propuestas, órdenes, guías, SIDREP y cierre documental.</footer></article>
    {canManage(actor)&&<div className="supply-columns ledger-forms print-hide"><section className="section-card"><div className="section-heading"><div><div className="eyebrow">CIERRE DOCUMENTAL</div><h2>{isEyj?"Guía de despacho y documentos":"Guías y seguimiento"}</h2></div></div><ServiceLedgerForm key={`guide-${query.formulario==="guide"?saved:""}`} id={id} kind="guide" isEyj={isEyj} context={context} defaults={guideDefaults} managers={managers} responsibleName={f?.responsible_name??""}/></section>
      <section className="section-card"><div className="section-heading"><div><div className="eyebrow">REFERENCIAS DEL SERVICIO</div><h2>Datos comerciales y transporte</h2></div></div><ServiceLedgerForm key={`commercial-${query.formulario==="commercial"?saved:""}`} id={id} kind="commercial" isEyj={isEyj} context={context} defaults={commercialDefaults}/></section></div>}
  </div>;
}
