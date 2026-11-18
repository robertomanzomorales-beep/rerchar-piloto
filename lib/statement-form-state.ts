const fields={submission_key:36,client_id:36,number:40,period_on:10,statement_type:20,
  client_name:200,client_tax_id:30,client_address:300,client_contact:160,
  issuer_contact:160,contract_manager:160,contract_reference:100,notes:1000,cycle_id:36} as const;
export type StatementDraft=Partial<Record<keyof typeof fields,string>>;
export type StatementFormState={error:string;values:StatementDraft};

export function statementDraft(form:FormData):StatementDraft{
  return Object.fromEntries(Object.entries(fields).map(([key,max])=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,max):"",
  ]));
}
