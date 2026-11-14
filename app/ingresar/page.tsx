import { redirect } from "next/navigation";
import { LockKeyhole, ArrowRight } from "lucide-react";
import { getActor } from "@/lib/auth";
import { loginAction } from "@/app/actions";
import { SubmitButton } from "@/components/Transition";
import { PasswordField } from "@/components/PasswordField";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getActor()) redirect("/");
  const { error } = await searchParams;
  return <main className="login-page">
    <div className="login-card">
      <div className="brand-login"><div className="login-brand-pair"><span>R</span><span>EJ</span></div><div className="system-name"><strong>PLATAFORMA OPERATIVA</strong><span>RERCHAR · E y J</span></div></div>
      <div className="login-icon"><LockKeyhole size={22} /></div>
      <h1>Ingresar a la operación</h1>
      <p>Acceso exclusivo para el equipo y los usuarios autorizados.</p>
      {error && <div className="notice notice-error" role="alert">Correo o contraseña incorrectos. Revise sus datos e intente nuevamente.</div>}
      <form action={loginAction} className="form-stack">
        <label>Correo electrónico<input name="email" type="email" autoComplete="username" required placeholder="nombre@empresa.cl" /></label>
        <PasswordField/>
        <SubmitButton className="button button-primary button-full">Ingresar <ArrowRight size={17} /></SubmitButton>
      </form>
      <div className="login-foot">RERCHAR Chile SpA · E y J Limitada<br/>Diseñado y potenciado por <a href="https://vialoop.cl" target="_blank" rel="noopener noreferrer">vialoop.cl</a></div>
    </div>
  </main>;
}
