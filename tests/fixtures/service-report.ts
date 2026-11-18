import type {Db} from "../../lib/db";
import type {Actor} from "../../lib/auth";

export async function seedServiceReport(db:Db){
  const [client,other]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente reporte propio'),('Cliente reporte ajeno') RETURNING id");
  const [site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena propia') RETURNING id",[client.id]);
  const [otherSite]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena ajena') RETURNING id",[other.id]);
  const actors={} as Record<"admin"|"operaciones"|"cliente"|"conductor"|"otherDriver",Actor>;
  for(const role of ["admin","operaciones","cliente","conductor","otherDriver"] as const){
    const [user]=await db.query<{id:string}>(`INSERT INTO users(email,name,password_hash,role,client_id)
      VALUES($1,$2,'hash',$3,$4) RETURNING id`,[role.toLowerCase()+"@report.invalid","Reporte "+role,role==="otherDriver"?"conductor":role,role==="cliente"?client.id:null]);
    actors[role]={id:user.id,email:role+"@report.invalid",name:"Reporte "+role,role:role==="otherDriver"?"conductor":role,client_id:role==="cliente"?client.id:null};
  }
  await db.query(`INSERT INTO service_requests
    (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,
     gross_kg,tare_kg,driver_id,created_by,created_at)
    SELECT gen_random_uuid(),CASE WHEN n<=1001 THEN $1::uuid ELSE $2::uuid END,
      CASE WHEN n<=1001 THEN $3::uuid ELSE $4::uuid END,'rerchar','retiro','Material reporte',
      'Faena','Patio',CASE WHEN n=4 THEN 'solicitada' ELSE 'completada' END,
      CASE WHEN n IN (1,3) THEN NULL WHEN n=5 THEN 100 ELSE 150 END,
      CASE WHEN n IN (2,3) THEN NULL ELSE 100 END,
      CASE WHEN n<=10 THEN $5::uuid ELSE $6::uuid END,$7::uuid,'2026-11-19T02:30:00.123456Z'::timestamptz
    FROM generate_series(1,1205) n`,[client.id,other.id,site.id,otherSite.id,actors.conductor.id,actors.otherDriver.id,actors.admin.id]);
  await db.query(`INSERT INTO service_requests
    (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by,created_at)
    SELECT gen_random_uuid(),$1,$2,CASE WHEN n<=2 THEN 'e_y_j' ELSE NULL END,'traslado','Otro material',
      'Faena','Planta',$3,'2026-11-19T03:01:00Z'::timestamptz FROM generate_series(1,3) n`,[other.id,otherSite.id,actors.admin.id]);
  await db.query(`INSERT INTO service_requests
    (submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,created_by,deleted_at)
    VALUES(gen_random_uuid(),$1,$2,'rerchar','retiro','Registro eliminado','Faena','Patio',$3,now())`,[client.id,site.id,actors.admin.id]);
  return {actors,client,other,site,otherSite};
}
