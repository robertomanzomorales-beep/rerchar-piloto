import {GET as operationFile} from "@/lib/api-downloads/operation-file";
import {GET as certificatePdf} from "@/lib/api-downloads/certificate-pdf";
import {GET as quotePdf} from "@/lib/api-downloads/quote-pdf";
import {GET as quoteDocument} from "@/lib/api-downloads/quote-document";
import {GET as destinationSupport} from "@/lib/api-downloads/destination-support";
import {GET as paymentStatementPdf} from "@/lib/api-downloads/payment-statement-pdf";
import {GET as evidence} from "@/lib/api-downloads/evidence";
import {GET as counterpartyDocument} from "@/lib/api-downloads/counterparty-document";
import {GET as assetDocument} from "@/lib/api-downloads/asset-document";
import {GET as containerPhoto} from "@/lib/api-downloads/container-photo";
import {GET as transferProof} from "@/lib/api-downloads/transfer-proof";
import {GET as edpConsolidated} from "@/lib/api-downloads/edp-consolidated";
import {GET as receivablesExport} from "@/lib/api-downloads/receivables-export";
import {GET as quotesExport} from "@/lib/api-downloads/quotes-export";
import {GET as materialsExport} from "@/lib/api-downloads/materials-export";
import {GET as environmentReport} from "@/lib/api-downloads/environment-report";
import {GET as auditReport} from "@/lib/api-downloads/audit-report";
import {GET as servicesReport} from "@/lib/api-downloads/services-report";

export const runtime="nodejs";
export const dynamic="force-dynamic";

type DownloadHandler=(request:Request,context:{params:Promise<{id:string}>})=>Promise<Response>;
const routes:{path:string[];handler:DownloadHandler}[]=[
  {path:["archivos-operacion",":id"],handler:operationFile},
  {path:["certificados",":id","pdf"],handler:certificatePdf},
  {path:["cotizaciones",":id","pdf"],handler:quotePdf},
  {path:["cotizaciones","documentos",":id"],handler:quoteDocument},
  {path:["destinos",":id","respaldo"],handler:destinationSupport},
  {path:["estados-pago",":id","pdf"],handler:paymentStatementPdf},
  {path:["estados-pago","consolidado",":id"],handler:edpConsolidated},
  {path:["evidencia",":id"],handler:evidence},
  {path:["fichas","documentos",":id"],handler:counterpartyDocument},
  {path:["flota-documentos",":id"],handler:assetDocument},
  {path:["contenedores","movimientos",":id","foto"],handler:containerPhoto},
  {path:["transferencias",":id","comprobante"],handler:transferProof},
  {path:["cobranzas","exportar"],handler:receivablesExport},
  {path:["cotizaciones","exportar"],handler:quotesExport},
  {path:["ingresos","exportar"],handler:materialsExport},
  {path:["reportes","ambiental"],handler:environmentReport},
  {path:["reportes","auditoria"],handler:auditReport},
  {path:["reportes","servicios"],handler:servicesReport},
];

export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;
  const route=routes.find(({path:pattern})=>pattern.length===path.length&&
    pattern.every((part,index)=>part===":id"||part===path[index]));
  if(!route)return new Response("No encontrado",{status:404});
  const id=route.path.includes(":id")?path[route.path.indexOf(":id")]:"";
  if(route.path.includes(":id")&&!id)return new Response("No encontrado",{status:404});
  return route.handler(request,{params:Promise.resolve({id})});
}
