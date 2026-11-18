export const materialFollowupFields={
  guide:["requested_on","received_on","valued_guide"],
  references:["entry_sheet","invoice_number","invoice_direction","invoice_issued_on","certificate_number"],
  payment:["payment_status","paid_on","payment_reference"],
  notice:["notified_on","recipient","note"],
} as const;
export type MaterialFollowupKind=keyof typeof materialFollowupFields;
type Field=(typeof materialFollowupFields)[MaterialFollowupKind][number];
export type MaterialFollowupValues=Partial<Record<Field,string>>;
export type MaterialFollowupFormState={error:string;values:MaterialFollowupValues};
export const materialFollowupAnchors={guide:"guia-valorizada",references:"factura-documentos",payment:"pago-material",notice:"aviso-documental"} as const;
const limits:Record<Field,number>={requested_on:10,received_on:10,valued_guide:80,entry_sheet:80,invoice_number:80,
  invoice_direction:20,invoice_issued_on:10,certificate_number:80,payment_status:20,paid_on:10,payment_reference:120,
  notified_on:10,recipient:180,note:500};
export function materialFollowupDraft(kind:MaterialFollowupKind,form:FormData):MaterialFollowupValues{
  return Object.fromEntries(materialFollowupFields[kind].map(key=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,limits[key]):"",
  ]));
}
