import type {Counterparty} from "./counterparties";
import {recordPage} from "./record-pagination";

export type CounterpartyContext={pagina?:string};
export type CounterpartyFormState={error:string;values:Record<string,string>};
export type CounterpartyClient={id:string;name:string;tax_id:string|null;email:string|null;address:string|null};
export const emptyCounterpartyState:CounterpartyFormState={error:"",values:{}};
export const counterpartyAreas=["compras","servicios","contabilidad","operaciones","prevencion"]as const;
const limits={id:36,client_id:36,kind:20,legal_name:180,trade_name:180,tax_id:25,business_activity:180,industry:120,
  legal_address:250,locality:160,phone:40,general_email:254,website:250,tax_status:20,legal_representative:180,
  invoice_email:254,payment_terms:10,requires_oc:3,requires_hes:3,requires_edp:3,edp_email:254,bank_name:100,
  account_type:20,account_number:60,account_holder:180,account_holder_tax_id:25,currency:20,proof_email:254,swift_iban:100,bank_notes:500}as const;
export const counterpartyFields=Object.keys(limits)as(keyof typeof limits)[];
export function counterpartyDraft(form:FormData,error:string):CounterpartyFormState{
  const entries:[string,string][]=[];
  for(const key of counterpartyFields){const value=form.get(key);entries.push([key,typeof value==="string"?value.slice(0,limits[key]):""]);}
  for(const area of counterpartyAreas)for(const[key,max]of Object.entries({name:120,role:100,phone:40,email:254})){
    const field=`${area}_${key}`,value=form.get(field);entries.push([field,typeof value==="string"?value.slice(0,max):""]);
  }
  return{error,values:Object.fromEntries(entries)};
}
export function counterpartyDefaults(profile?:Counterparty,client?:CounterpartyClient){
  const values:Record<string,string>=Object.fromEntries(counterpartyFields.map(key=>[key,String(profile?.[key]??"")]));
  values.kind=profile?.kind??(client?"cliente":"proveedor");values.client_id=profile?.client_id??client?.id??"";
  values.legal_name=profile?.legal_name??client?.name??"";values.tax_id=profile?.tax_id??client?.tax_id??"";
  values.legal_address=profile?.legal_address??client?.address??"";values.general_email=profile?.general_email??client?.email??"";
  values.tax_status=profile?.tax_status??"afecto";values.payment_terms=profile?.payment_terms??"30";values.currency=profile?.currency??"CLP";
  for(const key of["requires_oc","requires_hes","requires_edp"]as const)values[key]=profile?.[key]?"si":"no";
  for(const area of counterpartyAreas){const contact=profile?.contacts.find(item=>item.area===area);for(const key of["name","role","phone","email"]as const)values[`${area}_${key}`]=contact?.[key]??"";}
  return values;
}
export function counterpartyContext(input:{pagina?:unknown}):CounterpartyContext{const page=recordPage(input.pagina);return page>1?{pagina:String(page)}:{};}
export function counterpartyHref(context:CounterpartyContext={},id="",notice:{ok?:string;error?:string;cliente?:string}={}){
  const query=new URLSearchParams(counterpartyContext(context)),uuid=/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;
  if(notice.ok==="1")query.set("ok","1");if(notice.error)query.set("error",notice.error);
  if(notice.cliente&&uuid.test(notice.cliente))query.set("cliente",notice.cliente);
  const target=id==="nueva"?"/nueva":uuid.test(id)?`/${id}`:"";
  return `/fichas${target}${query.size?`?${query}`:""}`;
}
