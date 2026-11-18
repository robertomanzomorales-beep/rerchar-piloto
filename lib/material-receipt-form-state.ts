const fields={client_id:36,service_id:36,kind:20,movement_on:10,site_name:180,origin:180,destination:180,
  driver_name:120,driver_tax_id:25,truck_plate:20,trailer_plate:30,weighing_ticket:80,material_id:36,
  material_name:180,receipt_mode:20,supplier_kg:30,rerchar_kg:30,impurity_kg:30,net_basis:20,net_reported_kg:30,
  impurity_report:80,origin_guide:80,transfer_guide:80,entry_sheet:80,valued_guide:80,certificate_number:80,
  act_number:80,invoice_number:80,unit_price_clp:30,payment_status:20,paid_on:10,notes:1000} as const;
export const materialReceiptFields=Object.keys(fields) as (keyof typeof fields)[];
export type MaterialReceiptDraft=Partial<Record<keyof typeof fields,string>>;
export type MaterialReceiptFormState={error:string;values:MaterialReceiptDraft};
export function materialReceiptDraft(form:FormData):MaterialReceiptDraft{
  return Object.fromEntries(Object.entries(fields).map(([key,max])=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,max):"",
  ]));
}
