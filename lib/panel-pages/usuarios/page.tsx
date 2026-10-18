import {redirect} from "next/navigation";
import Link from "next/link";
import {KeyRound,ShieldCheck,UserRoundPlus,Users} from "lucide-react";
import {requireActor,type Role} from "@/lib/auth";
import {db} from "@/lib/db";
import {listUsers} from "@/lib/users";
import {Notice} from "@/components/UI";
import {SubmitButton} from "@/components/Transition";
import {UserRoleFields} from "@/components/UserRoleFields";
import {changeRoleAction,createAccountAction,resetAccountPasswordAction,setAccountActiveAction} from "@/app/user-actions";

const roleName:Record<Role,string>={admin:"Administración",operaciones:"Operaciones",conductor:"Conductor",cliente:"Cliente"};

export default async function UsersPage({searchParams}:{searchParams:Promise<{error?:string;ok?:string}>}){
  const actor=await requireActor();
  if(actor.role!=="admin")redirect("/");
  const [users,clients,notice]=await Promise.all([
    listUsers(actor),db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name"),searchParams,
  ]);
  const activeAdmins=users.filter(user=>user.role==="admin"&&user.active).length;
  return <>
    <div className="page-title-row"><div><div className="eyebrow">CONTROL DE ACCESO</div><h1>Usuarios y permisos</h1><p className="page-intro">Cree accesos, limite el portal a la empresa correcta y mantenga vigentes los perfiles del equipo.</p></div><span className="title-icon"><Users size={22}/></span></div>
    <Notice error={notice.error} ok={notice.ok}/>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">NUEVA CUENTA</div><h2><UserRoundPlus size={18}/> Crear acceso</h2></div></div>
      <p className="helper-text">La contraseña inicial se entrega por el canal acordado; el sistema no envía invitaciones. El perfil Cliente sólo verá los servicios, evidencias y certificados de su empresa.</p>
      {!clients.length&&<p className="helper-text">Para crear una cuenta Cliente primero debe <Link href="/maestros">registrar su empresa en Maestros</Link>.</p>}
      <form action={createAccountAction} className="form-grid detail-form"><label>Nombre<input name="name" required maxLength={120} autoComplete="off"/></label><label>Correo electrónico<input name="email" type="email" required maxLength={254} autoComplete="off"/></label>
        <UserRoleFields clients={clients} initialRole={clients.length?"cliente":"operaciones"}/>
        <label className="field-full">Contraseña inicial (12 a 128 caracteres)<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label>
        <div className="field-full form-footer"><SubmitButton className="button button-primary">Crear usuario</SubmitButton></div>
      </form>
    </section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CUENTAS REGISTRADAS</div><h2><ShieldCheck size={18}/> Personas con acceso</h2></div><span className="count-pill">{users.length}</span></div>
      <div className="user-list">{users.map(user=>{
        const isSelf=user.id===actor.id;
        const lastAdmin=user.role==="admin"&&user.active&&activeAdmins===1;
        return <article className="user-item" key={user.id}>
          <div className="user-identity"><span className="user-initial">{user.name.trim().slice(0,1).toUpperCase()}</span><div><strong>{user.name}{isSelf&&<span className="user-self"> · su cuenta</span>}</strong><small>{user.email}</small></div></div>
          <div className="user-scope"><strong>{roleName[user.role]}</strong><small>{user.role==="cliente"?(user.client_name??"Cliente no disponible"):"Acceso interno"}</small></div>
          <div className="user-state"><span className={user.active?"user-active":"user-inactive"}>{user.active?"Activa":"Suspendida"}</span><small>{user.active?`${user.sessions} sesión(es) abierta(s)`:"Sin acceso al sistema"}{user.active&&user.locked_until&&new Date(user.locked_until)>new Date()?" · bloqueo temporal":""}</small></div>
          <div className="user-actions">
            <details className="user-control"><summary>Perfil y empresa</summary><form action={changeRoleAction} className="form-stack compact"><input type="hidden" name="id" value={user.id}/><UserRoleFields clients={clients} initialRole={user.role} initialClient={user.client_id??""}/><SubmitButton className="button button-outline">Guardar cambios</SubmitButton></form></details>
            <details className="user-control"><summary><KeyRound size={14}/> Nueva contraseña</summary><form action={resetAccountPasswordAction} className="form-stack compact"><input type="hidden" name="id" value={user.id}/><label>Clave nueva<input name="password" type="password" minLength={12} maxLength={128} required autoComplete="new-password"/></label><SubmitButton className="button button-outline">Cambiar clave y cerrar sesiones</SubmitButton></form></details>
            <form action={setAccountActiveAction}><input type="hidden" name="id" value={user.id}/><input type="hidden" name="active" value={user.active?"false":"true"}/><SubmitButton className="button button-outline" disabled={user.active&&(isSelf||lastAdmin)}>{user.active?"Suspender acceso":"Reactivar cuenta"}</SubmitButton></form>
          </div>
        </article>;
      })}</div>
    </section>
  </>;
}
