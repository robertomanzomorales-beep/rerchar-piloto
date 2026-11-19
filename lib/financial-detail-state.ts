import {isFinanceId} from "./finance-catalog-state";
import {recordPage} from "./record-pagination";

export const financialDetailFields={
  value:["tariff_id","client_order_reference"],reference:["client_order_reference","reason"],
  invoice:["invoice_number","issued_on","due_on","total_clp"],confirm:["invoice_id","total_clp","reason"],
  void:["invoice_id","reason"],payment:["invoice_id","submission_key","amount_clp","paid_on","method","reference"],
  cost:["submission_key","category","amount_clp","description"],
} as const;
export type FinancialDetailKind=keyof typeof financialDetailFields;
type Field=(typeof financialDetailFields)[FinancialDetailKind][number];
export type FinancialDetailValues=Partial<Record<Field,string>>;
export type FinancialDetailState={error:string;values:FinancialDetailValues};
const limits:Record<Field,number>={tariff_id:36,client_order_reference:80,reason:500,invoice_number:80,issued_on:10,due_on:10,total_clp:24,invoice_id:36,submission_key:36,amount_clp:24,paid_on:10,method:20,reference:120,category:20,description:500};
export function financialDetailDraft(kind:FinancialDetailKind,form:FormData):FinancialDetailValues{return Object.fromEntries(financialDetailFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));}
export const financialDetailPages=["pagina_costos","pagina_abonos","pagina_anuladas"] as const;
export type FinancialDetailPage=(typeof financialDetailPages)[number];
export type FinancialDetailContext=Partial<Record<FinancialDetailPage,string>>;
export function financialDetailContext(input:FinancialDetailContext):FinancialDetailContext{return Object.fromEntries(financialDetailPages.map(key=>[key,recordPage(input[key])]).filter(([,value])=>Number(value)>1).map(([key,value])=>[key,String(value)]));}
export function financialDetailContextFromForm(form:FormData){return financialDetailContext(Object.fromEntries(financialDetailPages.map(key=>[key,String(form.get(key)??"")])));}
export const financialDetailAnchors:Record<FinancialDetailKind,string>={value:"tarifa-servicio",reference:"referencia-cliente",invoice:"factura-servicio",confirm:"conciliar-factura",void:"anular-factura",payment:"registrar-abono",cost:"registrar-costo"};
export function financialDetailHref(id:string,context:FinancialDetailContext={},anchor="",flags:{ok?:string;formulario?:string;factura?:string;origen?:string;registro?:string}={}){
  if(!isFinanceId(id))return "/finanzas";
  const query=new URLSearchParams(financialDetailContext(context) as Record<string,string>);
  for(const key of ["formulario","origen"] as const)if(flags[key]&&Object.hasOwn(financialDetailFields,flags[key]!))query.set(key,flags[key]!);
  if(isFinanceId(flags.factura))query.set("factura",flags.factura!);if(isFinanceId(flags.registro))query.set("registro",flags.registro!);if(flags.ok)query.set("ok",flags.ok);
  return `/finanzas/${id}${query.size?"?"+query:""}${anchor?"#"+anchor:""}`;
}
export const financialCostLabels:Record<string,string>={mano_obra:"Mano de obra",disposicion:"Disposición",peajes:"Peajes",equipos:"Equipos",otros:"Otros"};
export const financialPaymentLabels:Record<string,string>={transferencia:"Transferencia",efectivo:"Efectivo",tarjeta:"Tarjeta",otro:"Otro"};
export const financialMoney=(value:string|number)=>Number(value).toLocaleString("es-CL",{maximumFractionDigits:2});
