const presentationFields={company_intro:700,proposal_objective:700,notes:1000};
const lineFields={description:240,principal:40,segment:80,unit:40,quantity:30,
  unit_price_clp:30,currency:3,waste_category:40,destination_id:36,material_id:36,line_note:500,taxable:2};
const fields={presentation:presentationFields,add:lineFields,edit:lineFields,uf:{rate:30,on:10}} as const;

export type QuoteContentKind=keyof typeof fields;
export type QuoteContentState={error:string;values:Record<string,string>};

export function quoteContentDraft(kind:QuoteContentKind,form:FormData):Record<string,string>{
  return Object.fromEntries(Object.entries(fields[kind]).map(([key,max])=>{
    const value=form.get(key);
    return [key,typeof value==="string"?value.slice(0,max):""];
  }));
}
