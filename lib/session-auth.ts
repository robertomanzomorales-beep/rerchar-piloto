import {createHash,randomBytes} from "node:crypto";
import {db,transaction} from "./db";
import {verifyPassword} from "./password";

export const sessionSeconds=12*60*60;
export const sessionTokenHash=(token:string)=>createHash("sha256").update(token).digest("hex");
const dummy="scrypt:9c3c60306be04dc11919b5f8a6769a41:95f00ace85a03f54fa932b402129c732570284482762c56416e06783da238daf0727267de0a4b0c18cb5ac1259a1ab8a6b9e6a33ce991cd0da70ea312406a";
type Candidate={id:string;email:string;password_hash:string;role:string;client_id:string|null};
type Current=Candidate&{active:boolean;failed_attempts:number;locked:boolean;expired_lock:boolean};

// La verificación costosa ocurre sin bloquear la fila; antes de emitir la sesión
// se comprueban otra vez las credenciales y el perfil, dentro de la transacción.
export async function createLoginSession(email:string,password:string,previousToken?:string):Promise<string|null>{
  const normalized=email.trim().toLowerCase();
  if(!normalized||normalized.length>254||!password||password.length>128)return null;
  const [candidate]=await db.query<Candidate>("SELECT id,email,password_hash,role,client_id FROM users WHERE email=$1 AND active=true",[normalized]);
  const valid=await verifyPassword(password,candidate?.password_hash??dummy);
  if(!candidate)return null;
  return transaction(async tx=>{
    const [current]=await tx.query<Current>(`SELECT id,email,password_hash,role,client_id,active,failed_attempts,
      (locked_until IS NOT NULL AND locked_until>clock_timestamp()) AS locked,
      (locked_until IS NOT NULL AND locked_until<=clock_timestamp()) AS expired_lock
      FROM users WHERE id=$1 FOR UPDATE`,[candidate.id]);
    if(!current?.active||current.password_hash!==candidate.password_hash||current.email!==candidate.email||current.role!==candidate.role||current.client_id!==candidate.client_id)return null;
    if(current.locked)return null;
    if(!valid){
      const attempts=Math.min(5,(current.expired_lock?0:Math.max(0,current.failed_attempts))+1);
      await tx.query("UPDATE users SET failed_attempts=$2,locked_until=CASE WHEN $2>=5 THEN clock_timestamp()+interval '15 minutes' ELSE NULL END WHERE id=$1",[current.id,attempts]);
      return null;
    }
    await tx.query("UPDATE users SET failed_attempts=0,locked_until=NULL WHERE id=$1",[current.id]);
    if(previousToken&&/^[0-9a-f]{64}$/.test(previousToken))await tx.query("DELETE FROM sessions WHERE token_hash=$1",[sessionTokenHash(previousToken)]);
    const token=randomBytes(32).toString("hex");
    await tx.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,clock_timestamp()+($3::integer*interval '1 second'))",[sessionTokenHash(token),current.id,sessionSeconds]);
    return token;
  });
}
