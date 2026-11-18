const fields={submission_key:36,client_id:36,site_id:36,operating_company:20,
  request_category:20,service_type:20,material_id:36,new_site_name:180,new_site_address:250,
  waste_type:120,origin:250,destination:250,rental_from:10,rental_to:10,
  estimated_kg:30,priority:20,notes:2000} as const;
export type RequestDraft=Partial<Record<keyof typeof fields,string>>;
export type RequestFormState={error:string;values:RequestDraft};

// Only service fields return to the same form; action metadata and arbitrary keys do not.
export function requestDraft(form:FormData):RequestDraft{
  return Object.fromEntries(Object.entries(fields).map(([key,max])=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,max):"",
  ]));
}
