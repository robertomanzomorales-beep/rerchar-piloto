import { redirect } from "next/navigation";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { getActor } from "@/lib/auth";
import { loginAction } from "@/app/actions";
import { SubmitButton } from "@/components/Transition";
import { PasswordField } from "@/components/PasswordField";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getActor()) redirect("/");
  const { error } = await searchParams;
  return <main className="login-page">
    <section className="login-intro" aria-label="Empresas de la plataforma"><div className="login-intro-label">PLATAFORMA OPERATIVA</div><h2>La operación de cada empresa, en orden.</h2><p>Acceda a sus procesos, documentos y seguimiento desde un espacio de trabajo propio.</p><div className="login-company-list"><div className="login-company-rerchar"><Image src="/rerchar-logo-transparente.png" alt="RERCHAR" width={892} height={311} priority/><span>Materiales y economía circular</span></div><div className="login-company-eyj"><strong>E y J</strong><span>Servicios industriales</span></div></div></section>
    <div className="login-card">
      <div className="login-form-heading"><div className="login-form-mark"><span>RERCHAR</span><i/> <span>E y J</span></div><h1>Iniciar sesión</h1><p>Ingrese con su cuenta de operaciones.</p></div>
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
