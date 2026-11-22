export const supplierInvoiceDetailFields={
  review:["decision","note"],due:["due_on","reason"],payment:["submission_key","amount_clp","paid_on","reference"],
  request:["submission_key","amount_clp","bank_name","account_type","account_number"],
  approve:["note"],reject:["note"],execute:["paid_on","bank_reference"],
  verify:["checked_amount_clp","checked_reference","verification_note"],attachment:["kind"],
} as const;
export type SupplierInvoiceDetailKind=keyof typeof supplierInvoiceDetailFields;
type Field=(typeof supplierInvoiceDetailFields)[SupplierInvoiceDetailKind][number];
export type SupplierInvoiceDetailValues=Partial<Record<Field,string>>;
export type SupplierInvoiceDetailState={error:string;values:SupplierInvoiceDetailValues};
const limits:Record<Field,number>={decision:20,note:500,due_on:10,reason:300,submission_key:36,amount_clp:24,paid_on:10,reference:160,
  bank_name:100,account_type:20,account_number:60,bank_reference:160,checked_amount_clp:24,checked_reference:160,verification_note:500,kind:30};
export function supplierInvoiceDetailDraft(kind:SupplierInvoiceDetailKind,form:FormData):SupplierInvoiceDetailValues{
  return Object.fromEntries(supplierInvoiceDetailFields[kind].map(key=>[key,typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):""]));
}
export const supplierInvoiceDetailAnchors:Record<SupplierInvoiceDetailKind,string>={review:"revision-factura",due:"vencimiento-factura",payment:"pago-manual",request:"transferencias",approve:"transferencias",reject:"transferencias",execute:"transferencias",verify:"transferencias",attachment:"adjuntar-factura"};
export function supplierInvoiceDetailHref(invoiceId:string,kind:SupplierInvoiceDetailKind,transferId="",editing=false){
  const query=new URLSearchParams(editing?{formulario:kind}:{ok:"1"});
  if(transferId)query.set("transferencia",transferId);
  return `/facturas-recibidas/${encodeURIComponent(invoiceId)}?${query}#${transferId?"transferencia-"+encodeURIComponent(transferId):supplierInvoiceDetailAnchors[kind]}`;
}
