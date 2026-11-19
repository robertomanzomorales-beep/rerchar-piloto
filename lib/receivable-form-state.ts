import {isFinanceId} from "./finance-catalog-state";
import {recordPage} from "./record-pagination";
import {parseReceivableFilter} from "./receivable-export";

export const receivableFields={payment:["invoice_id","submission_key","amount_clp","paid_on","reference"],void:["invoice_id","reason"],reconcile:["id","invoice_number","invoiced_on","due_on","total_clp"]} as const;
export type ReceivableFormKind=keyof typeof receivableFields;
type Field=(typeof receivableFields)[ReceivableFormKind][number];
export type ReceivableValues=Partial<Record<Field,string>>;
export type ReceivableFormState={error:string;values:ReceivableValues};
const limits:Record<Field,number>={invoice_id:36,submission_key:36,amount_clp:24,paid_on:10,reference:120,reason:500,id:36,invoice_number:80,invoiced_on:10,due_on:10,total_clp:24};
export function receivableDraft(kind:ReceivableFormKind,form:FormData):ReceivableValues{return Object.fromEntries(receivableFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));}
export type ReceivableContext={empresa?:string;estado?:string;pagina?:string};
export function receivableContext(input:ReceivableContext):ReceivableContext{
  const page=recordPage(input.pagina);return {empresa:input.empresa==="e_y_j"?"e_y_j":"rerchar",estado:input.estado==="conciliar"?"conciliar":parseReceivableFilter(input.estado),...(page>1?{pagina:String(page)}:{})};
}
export function receivableContextFromForm(form:FormData){return receivableContext(Object.fromEntries(["empresa","estado","pagina"].map(key=>[key,String(form.get(key)??"")])));}
export function receivableAnchor(kind:ReceivableFormKind,id:string){return isFinanceId(id)?`${kind==="reconcile"?"conciliacion":"factura"}-${id}`:kind==="reconcile"?"conciliacion":"facturas-clientes";}
export function receivableHref(context:ReceivableContext,anchor="",flags:{ok?:string;error?:string;formulario?:string;origen?:string;registro?:string}={}){
  const query=new URLSearchParams(receivableContext(context) as Record<string,string>);
  for(const key of ["formulario","origen"] as const)if(flags[key]&&Object.hasOwn(receivableFields,flags[key]!))query.set(key,flags[key]!);
  if(isFinanceId(flags.registro))query.set("registro",flags.registro!);if(flags.ok)query.set("ok",flags.ok);if(flags.error)query.set("error",flags.error);
  return `/cobranzas?${query}${anchor?"#"+anchor:""}`;
}
