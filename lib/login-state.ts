export type LoginState={error:string;email:string};
export const loginFailureMessage="No fue posible iniciar sesión con esos datos. Revise el correo y la contraseña. Si realizó varios intentos, espere 15 minutos antes de volver a intentar.";
export function loginEmail(form:FormData){const email=form.get("email");return typeof email==="string"?email.trim().slice(0,254):"";}
