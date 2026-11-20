import type {Db} from "../../lib/db";
import type {Actor} from "../../lib/auth";

export function reviewRut(number:number){
  const body=String(number);let sum=0,multiplier=2;
  for(let i=body.length-1;i>=0;i--){sum+=Number(body[i])*multiplier;multiplier=multiplier===7?2:multiplier+1;}
  const digit=11-sum%11;return `${body}-${digit===11?"0":digit===10?"K":digit}`;
}
export async function seedCounterpartyReview(db:Db){
  const clients=await db.query<{id:string;name:string;tax_id:string;email:string;address:string}>(`INSERT INTO clients(name,tax_id,email,address)VALUES
    ('Cliente legal sintético',$1,'cliente@counterparty-review.example.invalid','Dirección sintética 123'),
    ('Otro cliente legal',$2,'otro@counterparty-review.example.invalid','Dirección sintética 456')RETURNING id,name,tax_id,email,address`,[reviewRut(80000001),reviewRut(80000002)]);
  const actors={}as Record<"admin"|"reviewer"|"operaciones"|"conductor"|"cliente",Actor>;
  for(const key of["admin","reviewer","operaciones","conductor","cliente"]as const){
    const role=key==="reviewer"?"admin":key;
    const[user]=await db.query<Actor>("INSERT INTO users(name,email,password_hash,role,client_id)VALUES($1,$2,'h',$3,$4)RETURNING id,name,email,role,client_id",["Revisión de fichas "+key,key+"@counterparty-review.example.invalid",role,role==="cliente"?clients[0].id:null]);actors[key]=user;
  }
  const rows=Array.from({length:425},(_,i)=>({name:`Proveedor sintético ${String(Math.floor(i/2)).padStart(4,"0")}`,rut:reviewRut(90000000+i),account:`CUENTA-SINTETICA-${String(i).padStart(5,"0")}`}));
  const profiles=await db.query<{id:string;legal_name:string;tax_id:string;account_number:string}>(`INSERT INTO counterparty_profiles
    (kind,legal_name,tax_id,business_activity,legal_address,locality,phone,general_email,tax_status,legal_representative,invoice_email,payment_terms,
     bank_name,account_type,account_number,account_holder,account_holder_tax_id,proof_email,created_by,updated_by)
    SELECT 'proveedor',name,rut,'Insumos sintéticos','Dirección de prueba 123','Calama','5550100','general@fixture.example.invalid','afecto',
      'Representante sintético','facturas@fixture.example.invalid','30','Banco sintético','corriente',account,name,rut,'comprobantes@fixture.example.invalid',$2,$2
    FROM jsonb_to_recordset($1::jsonb)AS x(name text,rut text,account text)RETURNING id,legal_name,tax_id,account_number`,[JSON.stringify(rows),actors.admin.id]);
  return{clients,actors,profiles};
}
