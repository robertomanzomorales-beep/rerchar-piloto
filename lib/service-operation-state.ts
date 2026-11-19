export const serviceOperationFields={
  plan:["scheduled_for","asset_id","ramp_asset_id","driver_selection"],rental:["asset_id"],cancel:["reason"],
  day:["day","outcome","observation","expected_revision"],checklist:["vehicle_ok","documents_ok","containment_ok","ppe_ok","vehicle_failure","comment"],
  finish:["gross_kg","tare_kg","guide_number","confirm_guide","confirm_sheet","confirm_ticket","confirm_material","confirm_weight","confirm_impurities","material_name","impurity_kg","missing_ticket_reason","review_note"],
} as const;
export type ServiceOperationKind=keyof typeof serviceOperationFields;
type Field=(typeof serviceOperationFields)[ServiceOperationKind][number];
export type ServiceOperationValues=Partial<Record<Field,string>>;
export type ServiceOperationState={error:string;values:ServiceOperationValues};
export const serviceOperationAnchors={plan:"planificacion",rental:"arriendo",cancel:"cancelar-servicio",day:"parte-diario",checklist:"checklist",finish:"revision"} as const;
const limits:Record<Field,number>={scheduled_for:16,asset_id:36,ramp_asset_id:36,driver_selection:50,reason:500,day:10,outcome:20,observation:1000,expected_revision:80,
  vehicle_ok:2,documents_ok:2,containment_ok:2,ppe_ok:2,vehicle_failure:2,comment:1000,gross_kg:30,tare_kg:30,guide_number:50,
  confirm_guide:2,confirm_sheet:2,confirm_ticket:2,confirm_material:2,confirm_weight:2,confirm_impurities:2,material_name:160,impurity_kg:30,missing_ticket_reason:500,review_note:1000};
export function serviceOperationDraft(kind:ServiceOperationKind,form:FormData):ServiceOperationValues{
  return Object.fromEntries(serviceOperationFields[kind].map(key=>[key,
    typeof form.get(key)==="string"?String(form.get(key)).replace(/\r\n?/g,"\n").slice(0,limits[key]):"",
  ]));
}
