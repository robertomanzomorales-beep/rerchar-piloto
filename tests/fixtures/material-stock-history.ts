import type {Db} from "../../lib/db";
import type {Actor} from "../../lib/auth";

export async function seedMaterialStockHistory(db:Db){
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente historial stock sintético') RETURNING id");
  const users=await db.query<{id:string;role:Actor['role'];email:string;name:string}>(`INSERT INTO users(name,email,password_hash,role,client_id)
    SELECT 'Revisión stock '||role,role||'@stock-history.example.invalid','hash',role,CASE WHEN role='cliente' THEN $1::uuid ELSE NULL END
    FROM unnest(ARRAY['admin','operaciones','cliente','conductor']) role RETURNING id,role,email,name`,[client.id]);
  const actors=Object.fromEntries(users.map(u=>[u.role,{...u,client_id:u.role==='cliente'?client.id:null}])) as Record<Actor['role'],Actor>;
  const materials=await db.query<{id:string;name:string}>("SELECT id,name FROM material_catalog WHERE active ORDER BY name LIMIT 3");
  const ids:Record<string,string[]>={};
  for(const [index,material] of materials.slice(0,2).entries()){
    const rows=await db.query<{id:string}>(`INSERT INTO material_stock_movements(material_id,kind,delta_kg,occurred_on,reference,reason,recorded_by,created_at)
      SELECT $1,'ajuste_entrada',1,$2::date,$3||n,'Acta sintética de revisión de historia',$4,$2::date::timestamptz
      FROM generate_series(1,205) n RETURNING id`,[material.id,index===0?'2026-11-22':'2026-11-01',index===0?'NEW-STOCK-':'OLD-STOCK-',actors.admin.id]);
    ids[material.id]=rows.map(r=>r.id).sort().reverse();
    await db.query("INSERT INTO material_stock_balances(material_id,quantity_kg) VALUES($1,205)",[material.id]);
  }
  return {actors,materials,ids,allIds:[...ids[materials[0].id],...ids[materials[1].id]]};
}
