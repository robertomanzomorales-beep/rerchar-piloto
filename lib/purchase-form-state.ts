const fields={submission_key:36,title:180,category:30,priority:20,item_id:36,quantity:32,notes:2000} as const;
export type PurchaseDraft=Partial<Record<keyof typeof fields,string>>;
export type PurchaseFormState={error:string;values:PurchaseDraft};

export function purchaseDraft(form:FormData):PurchaseDraft{
  return Object.fromEntries(Object.entries(fields).map(([key,max])=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).slice(0,max):"",
  ]));
}
