import {z} from "zod";
import type {Actor} from "./auth";
import {canManage} from "./auth";
import {db} from "./db";
import type {Company} from "./companies";
import {moduleReady} from "./schema-readiness";
import {listClientEdpInvoices} from "./edp-invoice-links";
import {lastRecordPage,recordPage,recordsPerPage} from "./record-pagination";

export class ClientRecordsError extends Error{}
export const dossierPageKeys=["pagina_servicios","pagina_cotizaciones","pagina_certificados","pagina_facturas","pagina_ingresos","pagina_archivos"] as const;
export type DossierPageKey=(typeof dossierPageKeys)[number];
export const dossierAnchors:Record<DossierPageKey,string>={pagina_servicios:"servicios-cliente",pagina_cotizaciones:"cotizaciones-cliente",pagina_certificados:"certificados-cliente",pagina_facturas:"facturas-cliente",pagina_ingresos:"ingresos-cliente",pagina_archivos:"archivos-cliente"};
export type ClientContext={empresa?:string;buscar?:string;pagina?:string}&Partial<Record<DossierPageKey,string>>;
export function clientContext(input:ClientContext):ClientContext{
  const result:ClientContext={};if(input.empresa==="rerchar"||input.empresa==="e_y_j")result.empresa=input.empresa;
  const q=input.buscar?.trim().slice(0,160);if(q)result.buscar=q;
  for(const key of ["pagina",...dossierPageKeys] as const){const page=recordPage(input[key]);if(page>1)result[key]=String(page);}return result;
}
export function clientHref(context:ClientContext,id="",anchor=""){
  const query=new URLSearchParams(clientContext(context) as Record<string,string>);
  return `/clientes${id?"/"+id:""}${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
export type ClientFile={id:string;name:string;tax_id:string|null;contact_name:string|null;email:string|null;address:string|null};
export type DirectoryClient={id:string;name:string;tax_id:string|null;services:string;sites:string};
export async function listClientDirectory(actor:Actor,query="",requestedPage=1){
  if(!canManage(actor))throw new ClientRecordsError("Sin acceso al directorio.");
  const search=query.trim().slice(0,160),pattern="%"+search.replace(/[\\%_]/g,"\\$&")+"%";
  const where="c.deleted_at IS NULL AND ($1='' OR c.name ILIKE $2 OR COALESCE(c.tax_id,'') ILIKE $2)";
  const [totals]=await db.query<{total:string}>(`SELECT count(*)::text AS total FROM clients c WHERE ${where}`,[search,pattern]);
  const total=Number(totals.total),totalPages=lastRecordPage(total),page=Math.min(recordPage(requestedPage),totalPages);
  const clients=await db.query<DirectoryClient>(`SELECT c.id,c.name,c.tax_id,
    (SELECT count(*)::text FROM service_requests s WHERE s.client_id=c.id AND s.deleted_at IS NULL) AS services,
    (SELECT count(*)::text FROM client_sites cs WHERE cs.client_id=c.id AND cs.deleted_at IS NULL) AS sites
    FROM clients c WHERE ${where} ORDER BY c.name,c.id LIMIT $3 OFFSET $4`,[search,pattern,recordsPerPage,(page-1)*recordsPerPage]);
  return {clients,total,totalPages,page};
}
export type ClientService={id:string;folio:string;operating_company:Company|null;service_type:string;site_name:string;waste_type:string;status:string;created_at:Date};
export type ClientDocument={id:string;service_id:string;folio:string;operating_company:Company|null;kind:string;description:string;filename:string|null;created_at:Date;actor_name:string};
export type ClientCertificate={id:string;service_id:string;folio:string;operating_company:Company|null;version:number;issued_at:Date};
export type ClientQuote={id:string;folio:string;display_folio:string|null;issuer:Company;title:string;status:string;created_at:Date;client_order_reference:string|null;client_order_exception:string|null;service_count:string;document_count:string};
export type ClientReceipt={id:string;movement_on:Date|string;kind:string;material_name:string;weighing_ticket:string|null;transfer_guide:string|null;origin_guide:string|null;entry_sheet:string|null};
export type ClientInvoice={id:string;source:"service"|"edp";invoice_number:string;issued_on:Date|string;folio?:string;operating_company?:Company|null;statement_numbers?:string[]};
const day=(value:Date|string)=>value instanceof Date?value.toISOString().slice(0,10):String(value).slice(0,10);
export async function clientFile(actor:Actor,id:string){
  if(!z.uuid().safeParse(id).success||actor.role==="conductor"||actor.role==="cliente"&&actor.client_id!==id)throw new ClientRecordsError("Cliente no disponible.");
  const [client]=await db.query<ClientFile>("SELECT id,name,tax_id,contact_name,email,address FROM clients WHERE id=$1 AND deleted_at IS NULL",[id]);
  if(!client)throw new ClientRecordsError("Cliente no disponible.");return client;
}
export async function listClientDossier(actor:Actor,id:string,requested:ClientContext={}){
  const client=await clientFile(actor,id),context=clientContext(requested);
  const profileReady=actor.role==="admin"&&await moduleReady("counterparty_profiles");
  const [[counts],individualInvoices,edpInvoices,profiles]=await Promise.all([
    db.query<Record<Exclude<DossierPageKey,"pagina_facturas">,string>>(`SELECT
      (SELECT count(*) FROM service_requests s WHERE s.client_id=$1 AND s.deleted_at IS NULL) AS pagina_servicios,
      (SELECT count(*) FROM client_quotes q WHERE q.client_id=$1 AND ($2<>'cliente' OR q.status IN ('enviada','aceptada','rechazada'))) AS pagina_cotizaciones,
      (SELECT count(*) FROM service_certificates c JOIN service_requests s ON s.id=c.service_id WHERE s.client_id=$1 AND s.deleted_at IS NULL AND c.status='vigente') AS pagina_certificados,
      (SELECT count(*) FROM material_receipts r WHERE r.client_id=$1) AS pagina_ingresos,
      (SELECT count(*) FROM service_evidence e JOIN service_requests s ON s.id=e.service_id WHERE s.client_id=$1 AND s.deleted_at IS NULL) AS pagina_archivos`,[id,actor.role]),
    db.query<ClientInvoice>(`SELECT i.id,'service'::text AS source,i.invoice_number,i.issued_on,s.folio,s.operating_company FROM service_invoices i
      JOIN service_valuations v ON v.id=i.valuation_id JOIN service_requests s ON s.id=v.service_id
      WHERE s.client_id=$1 AND s.deleted_at IS NULL AND i.status='emitida'`,[id]),
    listClientEdpInvoices(actor,id),
    profileReady?db.query<{id:string}>("SELECT id FROM counterparty_profiles WHERE client_id=$1",[id]):Promise.resolve([]),
  ]);
  const allInvoices:ClientInvoice[]=[...individualInvoices,...edpInvoices.map(i=>({...i,source:"edp" as const}))];
  allInvoices.sort((a,b)=>day(b.issued_on).localeCompare(day(a.issued_on))||`${b.source}:${b.id}`.localeCompare(`${a.source}:${a.id}`));
  const totals=Object.fromEntries(dossierPageKeys.map(key=>[key,key==="pagina_facturas"?allInvoices.length:Number(counts[key])])) as Record<DossierPageKey,number>;
  const pages=Object.fromEntries(dossierPageKeys.map(key=>[key,Math.min(recordPage(context[key]),lastRecordPage(totals[key]))])) as Record<DossierPageKey,number>;
  const args=(key:DossierPageKey)=>[id,recordsPerPage,(pages[key]-1)*recordsPerPage];
  const [services,quotes,certificates,receipts,documents]=await Promise.all([
    db.query<ClientService>(`SELECT s.id,s.folio,s.operating_company,s.service_type,cs.name AS site_name,s.waste_type,s.status,s.created_at
      FROM service_requests s JOIN client_sites cs ON cs.id=s.site_id WHERE s.client_id=$1 AND s.deleted_at IS NULL ORDER BY s.created_at DESC,s.id DESC LIMIT $2 OFFSET $3`,args("pagina_servicios")),
    db.query<ClientQuote>(`SELECT q.id,q.folio,q.display_folio,q.issuer,q.title,q.status,q.created_at,q.client_order_reference,q.client_order_exception,
      (SELECT count(*)::text FROM service_requests s WHERE s.quote_id=q.id AND s.deleted_at IS NULL) AS service_count,
      (SELECT count(*)::text FROM client_quote_documents d WHERE d.quote_id=q.id) AS document_count FROM client_quotes q
      WHERE q.client_id=$1 AND ($4<>'cliente' OR q.status IN ('enviada','aceptada','rechazada')) ORDER BY q.created_at DESC,q.id DESC LIMIT $2 OFFSET $3`,[...args("pagina_cotizaciones"),actor.role]),
    db.query<ClientCertificate>(`SELECT c.id,c.service_id,s.folio,s.operating_company,c.version,c.issued_at FROM service_certificates c
      JOIN service_requests s ON s.id=c.service_id WHERE s.client_id=$1 AND s.deleted_at IS NULL AND c.status='vigente' ORDER BY c.issued_at DESC,c.id DESC LIMIT $2 OFFSET $3`,args("pagina_certificados")),
    db.query<ClientReceipt>(`SELECT id,movement_on,kind,material_name,weighing_ticket,transfer_guide,origin_guide,entry_sheet FROM material_receipts
      WHERE client_id=$1 ORDER BY movement_on DESC,created_at DESC,id DESC LIMIT $2 OFFSET $3`,args("pagina_ingresos")),
    db.query<ClientDocument>(`SELECT e.id,e.service_id,s.folio,s.operating_company,e.document_kind AS kind,e.description,e.original_filename AS filename,e.created_at,u.name AS actor_name
      FROM service_evidence e JOIN service_requests s ON s.id=e.service_id JOIN users u ON u.id=e.created_by WHERE s.client_id=$1 AND s.deleted_at IS NULL
      ORDER BY e.created_at DESC,e.id DESC LIMIT $2 OFFSET $3`,args("pagina_archivos")),
  ]);
  return {client,profileReady,profile:profiles[0],services,quotes,certificates,receipts,documents,invoices:allInvoices.slice((pages.pagina_facturas-1)*recordsPerPage,pages.pagina_facturas*recordsPerPage),totals,pages};
}

export type ClientRetirement={id:string;folio:string;operating_company:Company;closed_at:Date;site_name:string;waste_type:string;guide_number:string|null;gross_kg:string|null;tare_kg:string|null};
export function retirementNet(service:Pick<ClientRetirement,"gross_kg"|"tare_kg">){
  if(service.gross_kg===null||service.tare_kg===null)return null;
  const gross=Number(service.gross_kg),tare=Number(service.tare_kg);
  return Number.isFinite(gross)&&Number.isFinite(tare)&&gross>=tare&&tare>=0?gross-tare:null;
}
export async function listClientRetirements(actor:Actor,id:string,company:Company){
  const client=await clientFile(actor,id);
  if(company!=="rerchar"&&company!=="e_y_j")throw new ClientRecordsError("Empresa inválida.");
  const services=await db.query<ClientRetirement>(`SELECT s.id,s.folio,s.operating_company,COALESCE(s.closed_at,s.created_at) AS closed_at,cs.name AS site_name,s.waste_type,s.guide_number,s.gross_kg,s.tare_kg
    FROM service_requests s JOIN client_sites cs ON cs.id=s.site_id WHERE s.client_id=$1 AND s.service_type='retiro' AND s.status='completada'
    AND s.operating_company=$2 AND s.deleted_at IS NULL ORDER BY COALESCE(s.closed_at,s.created_at) DESC,s.id DESC`,[id,company]);
  const unweighed=services.filter(s=>retirementNet(s)===null).length,total=services.reduce((sum,s)=>sum+(retirementNet(s)??0),0);
  return {client,services,total,unweighed};
}
