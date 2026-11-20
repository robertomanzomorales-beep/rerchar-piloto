export const guideControlFieldLimits={
  control_id:36,guide_number:50,line_number:3,movement_date:10,movement_type:20,
  origin_ticket:80,destination_ticket:80,return_ticket:80,departure_ticket:80,
  origin_kg:30,complementary_kg:30,arrival_kg:30,returned_impurities_kg:30,return_weight_kg:30,
  destination_impurities_kg:30,invoice_kg:30,agreed_price_clp:30,invoice_price_clp:30,
  invoice_number:80,valued_guide_number:80,invoice_issued_on:10,payment_on:10,
  driver_name:120,truck_plate:30,material_name:160,notes:500,freight_company:160,
  freight_invoice_number:80,freight_guide_reference:80,freight_payment_required:20,
} as const;
export type GuideControlValues=Partial<Record<keyof typeof guideControlFieldLimits,string>>;
export type GuideControlState={error:string;values:GuideControlValues};
export function guideControlDraft(form:FormData):GuideControlValues{
  return Object.fromEntries(Object.entries(guideControlFieldLimits).map(([key,max])=>{
    const value=form.get(key);
    return [key,typeof value==="string"?value.replace(/\r\n?/g,"\n").slice(0,max):""];
  }));
}
