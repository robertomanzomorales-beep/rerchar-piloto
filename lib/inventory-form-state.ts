const fields={
  warehouse:{code:30,name:120},
  item:{code:40,name:160,unit:20,category:100,minimum_qty:32,maximum_qty:32,unit_cost_clp:32},
  sku_rule:{category:100,prefix:10},
  valuation:{item_id:36,category:100,unit_cost_clp:32},
  adjust:{item_id:36,warehouse_id:36,direction:10,quantity:32,document_reference:100,cost_center:100,reason:500},
  transfer:{item_id:36,from_id:36,to_id:36,quantity:32,reason:500},
  reserve:{item_id:36,warehouse_id:36,quantity:32,reason:500},
} as const;
export type InventoryFormKind=keyof typeof fields;
export type InventoryValues=Record<string,string>;
export type InventoryFormState={error:string;values:InventoryValues;ok?:boolean};
export type InventoryContext={mes:string;articulo:string;bodega:string;pagina_kardex:string;pagina_reservas:string};

export function inventoryDraft(kind:InventoryFormKind,form:FormData):InventoryValues{
  return Object.fromEntries(Object.entries(fields[kind]).map(([name,max])=>[name,
    typeof form.get(name)==="string"?String(form.get(name)).slice(0,max):"",
  ]));
}
export function inventoryFormAnchor(kind:InventoryFormKind,id=""){
  return `inventario-${kind}${kind==="valuation"?`-${id.replace(/[^a-zA-Z0-9-]/g,"").slice(0,36)}`:""}`;
}
export function inventoryFormHref(context:InventoryContext,kind:InventoryFormKind,id=""){
  const params=new URLSearchParams();
  for(const name of ["mes","articulo","bodega","pagina_kardex","pagina_reservas"] as const)params.set(name,context[name]);
  params.set("inventario_form",kind);
  if(kind==="valuation")params.set("editar_articulo",id);
  return `/inventario?${params}#${inventoryFormAnchor(kind,id)}`;
}
