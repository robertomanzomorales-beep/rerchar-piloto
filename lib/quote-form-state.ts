const fields={submission_key:36,client_id:36,issuer:20,commercial_kind:30,title:180,
  company_intro:700,proposal_objective:700,notes:1000,issued_on:10,valid_until:10,vat_rate:10,validity_custom:5} as const;
export type QuoteDraft=Partial<Record<keyof typeof fields,string>>;
export type QuoteFormState={error:string;values:QuoteDraft};

export function quoteDraft(form:FormData):QuoteDraft{
  return Object.fromEntries(Object.entries(fields).map(([key,max])=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,max):"",
  ]));
}
