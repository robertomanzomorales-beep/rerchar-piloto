import type {Db} from "../../lib/db";
import type {Actor} from "../../lib/auth";

export async function seedGuideFollowupReview(db:Db,today:string){
  const [client]=await db.query<{id:string}>("INSERT INTO clients(name) VALUES('Cliente seguimiento sintético') RETURNING id"),[site]=await db.query<{id:string}>("INSERT INTO client_sites(client_id,name) VALUES($1,'Faena seguimiento sintética') RETURNING id",[client.id]);
  const actors={} as Record<"admin"|"operaciones"|"conductor"|"cliente",Actor>;
  for(const role of ["admin","operaciones","conductor","cliente"] as const){const [user]=await db.query<{id:string}>("INSERT INTO users(name,email,password_hash,role,client_id) VALUES($1,$2,'hash-prueba',$3,$4) RETURNING id",["Seguimiento "+role,role+"@followup-review.example.invalid",role,role==="cliente"?client.id:null]);actors[role]={id:user.id,name:"Seguimiento "+role,email:role+"@followup-review.example.invalid",role,client_id:role==="cliente"?client.id:null};}
  const groups:Record<string,string[]>={};
  async function group(label:string,total:number,options:{owner?:Actor;due?:number|null;received?:boolean;sent?:boolean;followup?:boolean;company?:string;kind?:string;status?:string;deleted?:boolean;scheduled?:number}={}){
    const rows=await db.query<{id:string}>(`INSERT INTO service_requests(submission_key,client_id,site_id,operating_company,service_type,waste_type,origin,destination,status,scheduled_for,created_by,deleted_at,rental_from,rental_to)
      SELECT gen_random_uuid(),$1,$2,$3,$4,$5||' '||n,'Faena','Patio',$6,(($7::date+$8::int)+time '12:00') AT TIME ZONE 'America/Santiago',$9,CASE WHEN $10 THEN now() ELSE NULL END,CASE WHEN $4='arriendo' THEN $7::date-10 ELSE NULL END,CASE WHEN $4='arriendo' THEN $7::date ELSE NULL END
      FROM generate_series(1,$11::int)n RETURNING id`,[client.id,site.id,options.company??"rerchar",options.kind??"traslado",label,options.status??"programada",today,options.scheduled??-10,actors.admin.id,options.deleted??false,total]);
    groups[label]=rows.map(row=>row.id);
    if(options.followup!==false)await db.query(`INSERT INTO valued_guide_followups(service_id,requested_on,due_on,responsible_user_id,received_on,documents_sent_on,updated_by)
      SELECT id,$2::date-9,CASE WHEN $3::int IS NULL THEN NULL ELSE $2::date+$3::int END,$4,
        CASE WHEN $5 THEN $2::date ELSE NULL END,CASE WHEN $6 THEN $2::date ELSE NULL END,$7 FROM service_requests WHERE id=ANY($1::uuid[])`,
      [groups[label],today,options.due===undefined?-1:options.due,(options.owner??actors.admin).id,options.received??false,options.sent??false,actors.admin.id]);
  }
  await group("Propia atrasada",312);
  await group("Otra persona atrasada",3,{owner:actors.operaciones});
  await group("Propia próxima",1,{due:2});await group("Propia futura",1,{due:9});await group("Propia sin plazo",1,{due:null});
  await group("Recibida sin cierre",1,{received:true});await group("Documentos enviados",1,{received:true,sent:true});
  await group("Jornada por solicitar",1,{followup:false});await group("Jornada futura",1,{followup:false,scheduled:9});
  await group("Excluir arriendo",1,{kind:"arriendo"});await group("Excluir cancelada",1,{status:"cancelada"});await group("Excluir archivada",1,{deleted:true});await group("Excluir E y J",1,{company:"e_y_j"});
  return {actors,groups,totalEligible:322,totalPending:318,ownOverdue:312,allOverdue:315,today};
}
