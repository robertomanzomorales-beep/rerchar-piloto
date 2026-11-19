import {redirect} from "next/navigation";
import Link from "next/link";
import {ShieldCheck,Users} from "lucide-react";
import {requireActor,type Role} from "@/lib/auth";
import {db} from "@/lib/db";
import {listUserBoard,type UserSummary} from "@/lib/users";
import {userContext,userHref,userId,type UserFormKind} from "@/lib/user-form-state";
import {recordsPerPage} from "@/lib/record-pagination";
import {UserForm} from "@/components/UserForm";

const roleName:Record<Role,string>={admin:"Administración",operaciones:"Operaciones",conductor:"Conductor",cliente:"Cliente"};
type Query={buscar?:string;perfil?:string;estado?:string;pagina?:string;usuario?:string;formulario?:string;ok?:string;guardado?:string};
export default async function UsersPage({searchParams}:{searchParams:Promise<Query>}){
  const actor=await requireActor();
  if(actor.role!=="admin")redirect("/");
  const query=await searchParams,context=userContext(query),selectedId=userId(query.usuario),saved=userId(query.guardado);
  const [board,clients]=await Promise.all([
    listUserBoard(actor,context,selectedId),db.query<{id:string;name:string}>("SELECT id,name FROM clients WHERE deleted_at IS NULL ORDER BY name,id"),
  ]);
  if(context.pagina!==board.page&&!query.formulario)redirect(userHref({...context,pagina:board.page}));
  const current={...context,pagina:board.page},filtered=!!(context.buscar||context.perfil||context.estado);
  function card(user:UserSummary,focused=false){
    const isSelf=user.id===actor.id,lastAdmin=user.role==="admin"&&user.active&&board.stats.active_admins===1;
    const form=(kind:UserFormKind)=><UserForm key={`${kind}-${selectedId===user.id?saved:""}`} kind={kind} context={current} clients={clients} target={user} protectedAccount={user.active&&(isSelf||lastAdmin)} initialOpen={!saved&&query.formulario===kind&&selectedId===user.id}/>;
    return <article className={`user-item${selectedId===user.id?" user-selected":""}`} key={user.id} id={`cuenta-${user.id}`} data-user-row={focused?undefined:user.id} data-user-focused={focused?user.id:undefined}>
      <div className="user-identity"><span className="user-initial" aria-hidden="true">{user.name.trim().slice(0,1).toUpperCase()}</span><div><strong>{user.name}{isSelf&&<span className="user-self"> · su cuenta</span>}</strong><small>{user.email}</small></div></div>
      <div className="user-scope"><strong>{roleName[user.role]}</strong><small>{user.role==="cliente"?(user.client_name??"Cliente no disponible"):"Acceso interno"}</small></div>
      <div className="user-state"><span className={user.active?"user-active":"user-inactive"}>{user.active?"Activa":"Suspendida"}</span><small>{user.active?`${user.sessions} ${Number(user.sessions)===1?"sesión abierta":"sesiones abiertas"}`:"Sin acceso al software"}{user.active&&user.locked_until&&new Date(user.locked_until)>new Date()?" · bloqueo temporal":""}</small></div>
      <div className="user-actions">{form("role")}{form("password")}{form("active")}</div>
    </article>;
  }
  function pagination(){return <nav className="user-pagination" aria-label="Páginas de usuarios">{board.page>1?<Link className="button button-outline" href={userHref({...current,pagina:board.page-1})}>Anterior</Link>:<span/>}<span>Página {board.page} de {board.pages}</span>{board.page<board.pages?<Link className="button button-outline" href={userHref({...current,pagina:board.page+1})}>Siguiente</Link>:<span/>}</nav>;}
  return <div className="users-admin">
    <div className="page-title-row"><div><div className="eyebrow">CONTROL DE ACCESO</div><h1>Usuarios y permisos</h1><p className="page-intro">Administre las cuentas del equipo y los accesos al portal de cada cliente.</p></div><span className="title-icon"><Users size={22}/></span></div>
    {query.ok==="1"&&saved&&<div className="notice notice-success" role="status">Cuenta actualizada correctamente.</div>}
    <dl className="user-overview" aria-label="Resumen de todas las cuentas"><div><dt>Cuentas</dt><dd>{board.stats.total}</dd></div><div><dt>Activas</dt><dd>{board.stats.active}</dd></div><div><dt>Suspendidas</dt><dd>{board.stats.suspended}</dd></div><div><dt>Bloqueo temporal</dt><dd>{board.stats.locked}</dd></div></dl>
    <section className="section-card"><UserForm key={`create-${saved}`} kind="create" context={current} clients={clients} initialOpen={query.formulario==="create"&&!saved}/>{!clients.length&&<p className="helper-text">Para crear una cuenta Cliente primero debe <Link href="/maestros">registrar su empresa en Maestros</Link>.</p>}</section>
    <section className="section-card"><div className="section-heading"><div><div className="eyebrow">CUENTAS REGISTRADAS</div><h2><ShieldCheck size={18}/> Personas con acceso</h2></div><span className="count-pill">{board.total}</span></div>
      <form method="get" action="/usuarios" className="user-filters" role="search"><label>Buscar cuenta o empresa<input name="buscar" defaultValue={context.buscar} maxLength={160} placeholder="Nombre, correo o empresa" type="search"/></label><label>Perfil<select name="perfil" defaultValue={context.perfil}><option value="">Todos los perfiles</option>{Object.entries(roleName).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select></label><label>Estado<select name="estado" defaultValue={context.estado}><option value="">Todos los estados</option><option value="activas">Activas</option><option value="suspendidas">Suspendidas</option><option value="bloqueadas">Con bloqueo temporal</option></select></label><button className="button button-primary" type="submit">Buscar</button>{filtered&&<Link className="button button-outline" href="/usuarios">Limpiar</Link>}</form>
      <p className="helper-text" data-user-count>{board.total?`Mostrando ${(board.page-1)*recordsPerPage+1}–${Math.min(board.page*recordsPerPage,board.total)} de ${board.total} cuentas${filtered?" que coinciden con los filtros":""}.`:"No hay cuentas que coincidan con los filtros."}</p>
      {board.pages>1&&pagination()}
      <div className="user-list">{board.rows.map(user=>card(user))}</div>
      {board.pages>1&&pagination()}
    </section>
    {board.selected&&<section className="section-card user-focused"><h2>Cuenta seleccionada</h2><p className="helper-text">Esta cuenta está fuera de la página o los filtros actuales. Puede revisar aquí sus cambios.</p>{card(board.selected,true)}</section>}
  </div>;
}
