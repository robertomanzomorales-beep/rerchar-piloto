import {isFinanceId} from "./finance-catalog-state";
import {guideFollowupHref,parseGuideFilter} from "./guide-followup-filters";
import {recordPage} from "./record-pagination";

export const ledgerFields={
  guide:["dispatch_guide_status","requested_on","due_on","responsible_user_id","received_on","documents_sent_on","notes"],
  commercial:["quote_reference","quote_on","order_reference","order_on","service_sheet","eyj_guide","client_guide","sidrep","rental_days","quantity","service_value_clp","notes"],
} as const;
export type LedgerKind=keyof typeof ledgerFields;
type Field=(typeof ledgerFields)[LedgerKind][number];
export type LedgerValues=Partial<Record<Field,string>>;
export type LedgerFormState={error:string;values:LedgerValues};
export type LedgerContext={seguimiento_estado?:string;seguimiento_pagina?:string};
const limits:Record<Field,number>={dispatch_guide_status:12,requested_on:10,due_on:10,responsible_user_id:36,received_on:10,documents_sent_on:10,notes:700,quote_reference:100,quote_on:10,order_reference:100,order_on:10,service_sheet:100,eyj_guide:100,client_guide:100,sidrep:100,rental_days:32,quantity:32,service_value_clp:32};
export const ledgerNumberLimits={rental_days:99_999_999.99,quantity:1_000_000_000,service_value_clp:1_000_000_000};
export const ledgerAnchor=(kind:LedgerKind)=>kind==="guide"?"seguimiento-documental":"datos-comerciales";
export function ledgerDraft(kind:LedgerKind,form:FormData):LedgerValues{return Object.fromEntries(ledgerFields[kind].map(field=>[field,typeof form.get(field)==="string"?String(form.get(field)).replace(/\r\n?/g,"\n").slice(0,field==="notes"&&kind==="guide"?500:limits[field]):""]));}
export function ledgerContext(input:LedgerContext):LedgerContext{
  const result:LedgerContext={};if(input.seguimiento_estado)result.seguimiento_estado=parseGuideFilter(input.seguimiento_estado);
  const page=recordPage(input.seguimiento_pagina);if(page>1)result.seguimiento_pagina=String(page);return result;
}
export function ledgerContextFromForm(form:FormData){return ledgerContext({seguimiento_estado:String(form.get("seguimiento_estado")??""),seguimiento_pagina:String(form.get("seguimiento_pagina")??"")});}
export function ledgerHref(id:string,context:LedgerContext={},kind?:LedgerKind,saved=""){
  if(!isFinanceId(id))return "/solicitudes";
  const query=new URLSearchParams(ledgerContext(context) as Record<string,string>);
  if(kind)query.set("formulario",kind);
  if(isFinanceId(saved)){query.set("ok","1");query.set("guardado",saved);}
  return `/solicitudes/${id}/seguimiento${query.size?"?"+query:""}${kind?"#"+ledgerAnchor(kind):""}`;
}
export function ledgerBackHref(context:LedgerContext){const normalized=ledgerContext(context);return guideFollowupHref(parseGuideFilter(normalized.seguimiento_estado),normalized.seguimiento_pagina);}
