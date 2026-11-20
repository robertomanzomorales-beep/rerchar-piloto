import type {Db} from "../../lib/db";
import type {Actor} from "../../lib/auth";
export async function seedComplianceReview(db:Db){
  const[client,other]=await db.query<{id:string}>("INSERT INTO clients(name)VALUES('Cliente ambiental sintético'),('Otro cliente ambiental')RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name)VALUES($1,'Faena ambiental')RETURNING id",[client.id]);
  const actors={}as Record<"admin"|"operaciones"|"conductor"|"cliente",Actor>;
  for(const role of["admin","operaciones","conductor","cliente"]as const){const[user]=await db.query<{id:string}>("INSERT INTO users(name,email,password_hash,role,client_id)VALUES($1,$2,'h',$3,$4)RETURNING id",["Revisión ambiental "+role,role+"@compliance-review.example.invalid",role,role==="cliente"?client.id:null]);actors[role]={id:user.id,name:"Revisión ambiental "+role,email:role+"@compliance-review.example.invalid",role,client_id:role==="cliente"?client.id:null};}
  const records:Record<string,{id:string;service_id:string}[]>={};
  for(const[company,count]of[["rerchar",325],["e_y_j",5]]as const){records[company]=await db.query<{id:string;service_id:string}>(`WITH services AS(
    INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,created_by,closed_at)
    SELECT gen_random_uuid(),$1,$2,$3,'retiro','Material ambiental','Faena','Patio','completada',100,50,$4,now() FROM generate_series(1,$5::int)RETURNING id)
    INSERT INTO waste_records(service_id,category,classification,generator_name,transporter_name,receiver_name,treatment,guide_number,quantity_kg,created_by)
    SELECT id,'no_peligroso','Chatarra','Generador sintético','Transportista sintético','Receptor sintético','Reciclaje','GD-TEST',50,$4 FROM services RETURNING id,service_id`,[client.id,site.id,company,actors.admin.id,count]);}
  await db.query("UPDATE waste_records SET status='declarado',external_system='SINADER',external_reference='REFERENCIA-OCUPADA',reported_on='2026-11-18' WHERE id=$1",[records.rerchar[0].id]);
  const pending=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,created_by,closed_at)
    SELECT gen_random_uuid(),$1,$2,'rerchar','retiro','Servicio por preparar '||n,'Faena','Patio','completada',100,50,$3,now()-n*interval '1 second' FROM generate_series(1,151)n RETURNING id`,[client.id,site.id,actors.admin.id]);
  const[missingWeight]=await db.query<{id:string}>("INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,gross_kg,tare_kg,created_by,closed_at)VALUES(gen_random_uuid(),$1,$2,'rerchar','retiro','Pesaje incompleto','Faena','Patio','completada',NULL,50,$3,now())RETURNING id",[client.id,site.id,actors.admin.id]);
  return{actors,client,other,records,pending,missingWeight};
}
