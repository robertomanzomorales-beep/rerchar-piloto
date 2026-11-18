export const certificateFields={prepare:["service_id","document_type"],revoke:["id","reason"]} as const;
export type CertificateFormKind=keyof typeof certificateFields;
type Field=(typeof certificateFields)[CertificateFormKind][number];
export type CertificateFormValues=Partial<Record<Field,string>>;
export type CertificateFormState={error:string;values:CertificateFormValues};
const limits:Record<Field,number>={service_id:36,document_type:30,id:36,reason:500};
export function certificateFormDraft(kind:CertificateFormKind,form:FormData):CertificateFormValues{
  return Object.fromEntries(certificateFields[kind].map(key=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,limits[key]):"",
  ]));
}
