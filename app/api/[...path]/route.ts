import {GET as operationFile} from "@/lib/api-downloads/operation-file";
import {GET as certificatePdf} from "@/lib/api-downloads/certificate-pdf";
import {GET as quotePdf} from "@/lib/api-downloads/quote-pdf";
import {GET as quoteDocument} from "@/lib/api-downloads/quote-document";
import {GET as destinationSupport} from "@/lib/api-downloads/destination-support";
import {GET as paymentStatementPdf} from "@/lib/api-downloads/payment-statement-pdf";
import {GET as evidence} from "@/lib/api-downloads/evidence";
import {GET as counterpartyDocument} from "@/lib/api-downloads/counterparty-document";
import {GET as assetDocument} from "@/lib/api-downloads/asset-document";
import {GET as transferProof} from "@/lib/api-downloads/transfer-proof";

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
  {path:["evidencia",":id"],handler:evidence},
  {path:["fichas","documentos",":id"],handler:counterpartyDocument},
  {path:["flota-documentos",":id"],handler:assetDocument},
  {path:["transferencias",":id","comprobante"],handler:transferProof},
];

export async function GET(request:Request,{params}:{params:Promise<{path:string[]}>}){
  const {path}=await params;
  const route=routes.find(({path:pattern})=>pattern.length===path.length&&
    pattern.every((part,index)=>part===":id"||part===path[index]));
  if(!route)return new Response("No encontrado",{status:404});
  const id=path[route.path.indexOf(":id")];
  if(!id)return new Response("No encontrado",{status:404});
  return route.handler(request,{params:Promise.resolve({id})});
}
