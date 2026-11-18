const fields={issuer:20,supplier_profile_id:36,supplier_tax_id:25,supplier_name:180,invoice_number:80,
  issued_on:10,due_on:10,description:500,net_clp:30,vat_clp:30,total_clp:30,cost_area:160,
  purchase_id:36,service_id:36,notes:1000} as const;
export type SupplierInvoiceDraft=Partial<Record<keyof typeof fields,string>>;
export type SupplierInvoiceFormState={error:string;values:SupplierInvoiceDraft};
export function supplierInvoiceDraft(form:FormData):SupplierInvoiceDraft{
  return Object.fromEntries(Object.entries(fields).map(([key,max])=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,max):"",
  ]));
}
import type {Company} from "./companies";

export type SupplierInvoicePurchase={id:string;folio:string;title:string;issuer:Company;order_reference:string|null;supplier_profile_id:string|null};
export type SupplierInvoiceService={id:string;folio:string;operating_company:Company};
