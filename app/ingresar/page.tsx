import { redirect } from "next/navigation";
import Image from "next/image";
import { getActor } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";
import {loginFailureMessage} from "@/lib/login-state";

export default async function Login({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getActor()) redirect("/");
  const { error } = await searchParams;
  return <main className="login-page">
    <section className="login-intro" aria-label="Empresas de la plataforma"><div className="login-intro-label">PLATAFORMA OPERATIVA</div><h2>La operación de cada empresa, en orden.</h2><p>Acceda a sus procesos, documentos y seguimiento desde un espacio de trabajo propio.</p><div className="login-company-list"><div className="login-company-rerchar"><Image src="/rerchar-logo-transparente.png" alt="RERCHAR" width={892} height={311} priority/><span>Materiales y economía circular</span></div><div className="login-company-eyj"><strong>E y J</strong><span>Servicios industriales</span></div></div></section>
    <div className="login-card">
      <div className="login-form-heading"><div className="login-form-mark"><span>RERCHAR</span><i/> <span>E y J</span></div><h1>Iniciar sesión</h1><p>Use el correo y la contraseña de su cuenta.</p></div>
      <LoginForm initialError={error?loginFailureMessage:""}/>
      <div className="login-foot">RERCHAR Chile SpA · E y J Limitada<br/>Diseñado y potenciado por <a href="https://vialoop.cl" target="_blank" rel="noopener noreferrer">vialoop.cl</a></div>
    </div>
  </main>;
}
