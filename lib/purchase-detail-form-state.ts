const fields={
  line:{item_id:36,quantity:32},
  draft:{issuer:20,supplier_profile_id:36,supplier:160,supplier_tax_id:20,supplier_address:250,supplier_contact:120,cost_center:120,payment_terms:120,expected_date:10,vat_rate:10},
  receive:{submission_key:36,line_id:36,warehouse_id:36,quantity:32,guide_number:80,invoice_number:80,payment_status:20,issuer:20,supplier:160},
} as const;
export type PurchaseDetailFormKind=keyof typeof fields;
export type PurchaseDetailValues=Record<string,string>;
export type PurchaseDetailFormState={error:string;values:PurchaseDetailValues;ok?:boolean};

export function purchaseDetailDraft(kind:PurchaseDetailFormKind,form:FormData):PurchaseDetailValues{
  const values:PurchaseDetailValues=Object.fromEntries(Object.entries(fields[kind]).map(([name,max])=>[name,
    typeof form.get(name)==="string"?String(form.get(name)).slice(0,max):"",
  ]));
  if(kind==="draft")for(const [name,value]of form.entries()){
    if(/^(?:price|discount)_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)&&typeof value==="string")values[name]=value.slice(0,32);
  }
  return values;
}
export const purchaseDetailAnchor=(kind:PurchaseDetailFormKind)=>`compra-${kind}`;
export function purchaseDetailFormHref(id:string,kind:PurchaseDetailFormKind){
  return `/compras/${encodeURIComponent(id)}#${purchaseDetailAnchor(kind)}`;
}
