"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, CalendarDays, Boxes, LogOut, Menu, ShieldCheck, Wrench, FileBarChart2, ShoppingCart, Warehouse, Fuel, Container, Users, Banknote, FileCheck2, ScrollText, FileBadge2 } from "lucide-react";
import type { Actor } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { NavPendingHint, SubmitButton } from "@/components/Transition";

export default function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const pathname = usePathname();
  const links = [
    { href: "/", text: "Resumen", icon: LayoutDashboard, visible: true },
    { href: "/solicitudes", text: "Solicitudes", icon: ClipboardList, visible: true },
    { href: "/agenda", text: "Agenda", icon: CalendarDays, visible: true },
    { href: "/contenedores", text: "Tolvas y contenedores", icon: Container, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/flota", text: "Flota y averías", icon: Wrench, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/mantenimiento", text: "Mantenimiento", icon: Wrench, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/combustible", text: "Combustible", icon: Fuel, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/personal", text: "Personal", icon: Users, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/compras", text: "Compras", icon: ShoppingCart, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/inventario", text: "Inventario", icon: Warehouse, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/finanzas", text: "Finanzas", icon: Banknote, visible: actor.role === "admin" },
    { href: "/cumplimiento", text: "Registro ambiental", icon: FileCheck2, visible: actor.role === "admin" || actor.role === "operaciones" },
    { href: "/certificados", text: "Certificados", icon: FileBadge2, visible: actor.role !== "conductor" },
    { href: "/reportes", text: "Reportes", icon: FileBarChart2, visible: true },
    { href: "/auditoria", text: "Auditoría", icon: ScrollText, visible: actor.role === "admin" },
    { href: "/usuarios", text: "Usuarios y accesos", icon: Users, visible: actor.role === "admin" },
    { href: "/maestros", text: "Maestros", icon: Boxes, visible: actor.role === "admin" || actor.role === "operaciones" },
  ];
  const nav = <nav className="nav-items" aria-label="Navegación principal">{links.filter((link) => link.visible).map((link) =>
    <Link key={link.href} href={link.href} className={`nav-link ${pathname === link.href || (link.href !== "/" && pathname.startsWith(link.href)) ? "active" : ""}`}>
      <link.icon size={18} strokeWidth={1.9}/>{link.text}<NavPendingHint/>
    </Link>,
  )}</nav>;
  return <div className="app-shell">
    <aside className="sidebar">
      <Link href="/" className="brand brand-sidebar" aria-label="RERCHAR Industrial Waste Management System · Resumen"><Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={2124} height={740} priority className="brand-art"/><span className="system-name"><strong>RERCHAR</strong><span>Industrial Waste<br/>Management System</span></span></Link>
      <div className="sidebar-section-label">PLATAFORMA</div>
      {nav}
      <div className="sidebar-bottom"><div className="sidebar-security"><ShieldCheck size={18}/> Acceso protegido</div>
        <div className="profile"><span className="profile-avatar">{actor.name.trim().slice(0, 1).toUpperCase()}</span><span className="profile-info"><strong>{actor.name}</strong><small>{actor.role === "operaciones" ? "Operaciones" : actor.role === "conductor" ? "Conductor" : actor.role === "cliente" ? "Cliente" : "Administración"}</small></span></div>
        <form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar"><div className="mobile-brand"><Image src="/rerchar-logo-transparente.png" alt="RERCHAR" width={2124} height={740} className="mobile-brand-art"/></div><span className="topbar-label">RERCHAR <span>Industrial Waste Management System</span><span className="topbar-dot"/> Piloto</span><span className="topbar-user">{actor.name}</span>
        <details className="mobile-nav"><summary aria-label="Abrir navegación"><Menu size={22}/></summary><div className="mobile-nav-menu">{nav}<form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form></div></details>
      </header>
      <div className="page-content">{children}</div>
    </div>
  </div>;
}
