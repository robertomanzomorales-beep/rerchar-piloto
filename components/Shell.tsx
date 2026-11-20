"use client";

import Link from "next/link";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { LayoutDashboard, ClipboardList, CalendarDays, Boxes, LogOut, Menu, ShieldCheck, Wrench, FileBarChart2, ShoppingCart, Warehouse, Fuel, Container, Users, Banknote, FileCheck2, ScrollText, FileBadge2, Building2, FileText, ReceiptText, Search, ChevronDown, MapPin, Settings2, X } from "lucide-react";
import type { Actor } from "@/lib/auth";
import { logoutAction } from "@/app/actions";
import { NavPendingHint, SubmitButton } from "@/components/Transition";
import GlobalSearch from "@/components/GlobalSearch";
import {companyForPath} from "@/lib/companies";

const navigationAppearance:Record<string,{tone:string;icon:typeof FileText}>={
  Comercial:{tone:"blue",icon:FileText},Operación:{tone:"cyan",icon:ClipboardList},
  "Cierre y control":{tone:"amber",icon:ReceiptText},Abastecimiento:{tone:"orange",icon:ShoppingCart},
  "Recursos compartidos":{tone:"lime",icon:Wrench},Configuración:{tone:"slate",icon:Settings2},
};

export default function Shell({ actor, children }: { actor: Actor; children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams=useSearchParams();
  const companyQuery=searchParams.get("empresa")??searchParams.get("company");
  const routeCompany=companyForPath(pathname,companyQuery);
  const [selectedCompany,setSelectedCompany]=useState<"rerchar"|"e_y_j"|null>(null);
  const [searchOpen,setSearchOpen]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [companyOpen,setCompanyOpen]=useState(false);
  const mobileToggle=useRef<HTMLButtonElement>(null);
  const mobileClose=useRef<HTMLButtonElement>(null);
  const mobileDrawer=useRef<HTMLElement>(null);
  const searchReturnFocus=useRef<HTMLElement>(null);
  const [expanded,setExpanded]=useState<{path:string;groups:Record<string,boolean>}>({path:"",groups:{}});
  const openSearch=useCallback((opener:HTMLElement|null)=>{
    if(searchOpen)return;
    searchReturnFocus.current=opener&&mobileDrawer.current?.contains(opener)?mobileToggle.current:opener;
    setMobileOpen(false);setCompanyOpen(false);setSearchOpen(true);
  },[searchOpen]);
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){
    event.preventDefault();openSearch(document.activeElement instanceof HTMLElement?document.activeElement:null);
  }};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[openSearch]);
  useEffect(()=>{
    if(routeCompany){localStorage.setItem("rerchar-selected-company",routeCompany);setSelectedCompany(routeCompany);}
    else if(pathname==="/"){localStorage.removeItem("rerchar-selected-company");setSelectedCompany(null);}
    else {const saved=localStorage.getItem("rerchar-selected-company");setSelectedCompany(saved==="rerchar"||saved==="e_y_j"?saved:null);}
  },[pathname,routeCompany]);
  useEffect(()=>{setMobileOpen(false);setCompanyOpen(false);},[pathname]);
  useEffect(()=>{
    if(!companyOpen)return;
    const dismiss=(event:PointerEvent)=>{if(event.target instanceof Element&&!event.target.closest('.company-picker'))setCompanyOpen(false);};
    const onKey=(event:KeyboardEvent)=>{if(event.key==="Escape")setCompanyOpen(false);};
    document.addEventListener("pointerdown",dismiss);document.addEventListener("keydown",onKey);
    return()=>{document.removeEventListener("pointerdown",dismiss);document.removeEventListener("keydown",onKey);};
  },[companyOpen]);
  useEffect(()=>{
    if(!mobileOpen)return;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    mobileClose.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){setMobileOpen(false);mobileToggle.current?.focus();}
      if(event.key==="Tab"){
        const focusable=Array.from(mobileDrawer.current?.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled])')??[])
          .filter(element=>!element.closest('[inert]')&&element.getClientRects().length>0);
        if(!focusable.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    const onResize=()=>{if(window.innerWidth>860)setMobileOpen(false);};
    window.addEventListener("keydown",onKey);
    window.addEventListener("resize",onResize);
    return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",onKey);window.removeEventListener("resize",onResize);};
  },[mobileOpen]);
  const activeCompany=pathname==="/"?null:routeCompany??selectedCompany;
  const selectedName=activeCompany==="e_y_j"?"E y J":activeCompany==="rerchar"?"RERCHAR":null;
  const companyExpanded=companyOpen;
  const companyOptions=<div className={`company-picker ${companyExpanded?"expanded":""}`}>
    <button type="button" className="company-picker-trigger" aria-expanded={companyExpanded} onClick={()=>setCompanyOpen(open=>!open)}><span className="company-picker-line" aria-hidden="true"/><span className="company-picker-copy"><strong>{selectedName??"Elegir empresa"}</strong><small>{activeCompany==="rerchar"?"Gestión de materiales":activeCompany==="e_y_j"?"Servicios industriales":"Seleccione una operación"}</small></span><ChevronDown size={16} aria-hidden="true"/></button>
    <div className="company-picker-panel" inert={!companyExpanded}><div className="company-picker-inner" aria-label="Empresa operadora">
      <Link href="/empresa/rerchar" aria-current={activeCompany==="rerchar"?"page":undefined} onClick={()=>{setCompanyOpen(false);setMobileOpen(false);}} className={`company-switch company-switch--rerchar ${activeCompany==="rerchar"?"selected":""}`}><span className="switch-mark" aria-hidden="true"/><span><strong>RERCHAR</strong><small>Gestión de materiales</small></span><span className="switch-indicator" aria-hidden="true"/></Link>
      <Link href="/empresa/e_y_j" aria-current={activeCompany==="e_y_j"?"page":undefined} onClick={()=>{setCompanyOpen(false);setMobileOpen(false);}} className={`company-switch company-switch--eyj ${activeCompany==="e_y_j"?"selected":""}`}><span className="switch-mark" aria-hidden="true"/><span><strong>E y J</strong><small>Servicios industriales</small></span><span className="switch-indicator" aria-hidden="true"/></Link>
    </div></div>
  </div>;
  const companyHref=(href:string)=>activeCompany&&["/cotizaciones","/clientes","/solicitudes","/agenda","/seguimiento-guias","/facturas-recibidas","/transferencias","/transacciones","/finanzas","/cobros-extraordinarios","/cobranzas","/documentos-sii"].includes(href)?`${href}?empresa=${activeCompany}`:activeCompany&&href==="/reportes"?`${href}?company=${activeCompany}`:href;
  const links = [
    { group:"Comercial", href: "/cotizaciones", text: "Cotizaciones", icon: FileText, visible: actor.role !== "conductor" },
    { group:"Comercial", href: "/clientes", text: actor.role==="cliente"?"Mi carpeta documental":"Clientes y documentos", icon: Building2, visible: actor.role !== "conductor" },
    { group:"Operación", href: "/solicitudes", text: "Solicitudes y despacho", icon: ClipboardList, visible: true },
    { group:"Operación", href: "/agenda", text: "Agenda", icon: CalendarDays, visible: true },
    { group:"Operación", href: "/ingresos", text: "Ingreso de material", icon: Boxes, visible: activeCompany!=="e_y_j" && actor.role !== "conductor" },
    { group:"Operación", href: "/seguimiento-guias", text: "Guías valorizadas", icon: ClipboardList, visible: activeCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Operación", href: "/control-guias", text: "Control de Guía · salidas", icon: FileText, visible: activeCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Operación", href: "/materiales-stock", text: "Stock de materiales", icon: Warehouse, visible: activeCompany!=="e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Cierre y control", href: "/estados-pago/calendario", text: "Calendario de EDP", icon: CalendarDays, visible: activeCompany === "e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Cierre y control", href: "/estados-pago", text: "Estados de pago", icon: ReceiptText, visible: activeCompany === "e_y_j" && (actor.role === "admin" || actor.role === "operaciones") },
    { group:"Cierre y control", href: "/finanzas", text: "Contratos, tarifas y facturas", icon: Banknote, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/cobros-extraordinarios", text: "Cobros extraordinarios", icon: ReceiptText, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/cobranzas", text: "Cobranza clientes", icon: Banknote, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/documentos-sii", text: "Documentos SII", icon: FileText, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/certificados", text: "Certificados RERCHAR", icon: FileBadge2, visible: activeCompany==="rerchar" && actor.role !== "conductor" },
    { group:"Cierre y control", href: "/cumplimiento", text: "Registro ambiental", icon: FileCheck2, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Cierre y control", href: "/transacciones", text: "Registro de transacciones", icon: ScrollText, visible: actor.role === "admin" },
    { group:"Cierre y control", href: "/reportes", text: "Reportes", icon: FileBarChart2, visible: true },
    { group:"Abastecimiento", href: "/facturas-recibidas", text: "Facturas recibidas", icon: FileText, visible: actor.role === "admin" },
    { group:"Abastecimiento", href: "/fichas", text: "Fichas cliente / proveedor", icon: Building2, visible: actor.role === "admin" },
    { group:"Abastecimiento", href: "/transferencias", text: "Solicitudes de transferencia", icon: Banknote, visible: actor.role === "admin" },
    { group:"Recursos compartidos", href: "/compras", text: "Órdenes de compra", icon: ShoppingCart, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/inventario", text: "Inventario", icon: Warehouse, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/contenedores", text: "Tolvas y contenedores", icon: Container, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/flota", text: "Flota y averías", icon: Wrench, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/mantenimiento", text: "Mantenimiento", icon: Wrench, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/combustible", text: "Combustible", icon: Fuel, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Recursos compartidos", href: "/personal", text: "Personal", icon: Users, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Configuración", href: "/maestros", text: "Maestros", icon: Boxes, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Configuración", href: "/destinos", text: "Destinos y autorizaciones", icon: MapPin, visible: actor.role === "admin" || actor.role === "operaciones" },
    { group:"Configuración", href: "/usuarios", text: "Usuarios y accesos", icon: Users, visible: actor.role === "admin" },
    { group:"Configuración", href: "/auditoria", text: "Auditoría", icon: ScrollText, visible: actor.role === "admin" },
  ];
  const searchItems=[{href:activeCompany?`/empresa/${activeCompany}`:"/",text:"Panel de empresa",group:"Inicio"},
    ...(activeCompany?links.filter(link=>link.visible).map(link=>({href:companyHref(link.href),text:link.text,group:link.group})):[])];
  const activeLink=links.filter(link=>link.visible&&(pathname===link.href||pathname.startsWith(`${link.href}/`)))
    .sort((a,b)=>b.href.length-a.href.length)[0];
  const activeHref=activeLink?.href;
  const activeGroup=links.find(link=>link.href===activeHref)?.group;
  const navKey=`${pathname}:${activeCompany??"selector"}`;
  const defaultGroups:Record<string,boolean>=activeGroup?{}:{"Comercial":true};
  const nav = (mobile=false) => <nav className="nav-items" aria-label={mobile?"Navegación móvil":"Navegación principal"}><Link href={activeCompany?`/empresa/${activeCompany}`:"/"} aria-current={pathname==="/"||pathname.startsWith("/empresa/")?"page":undefined} onClick={()=>mobile&&setMobileOpen(false)} className={`nav-link ${pathname==="/"||pathname.startsWith("/empresa/")?"active":""}`}><LayoutDashboard size={18}/> Panel de {selectedName??"empresas"} <NavPendingHint/></Link>{["Comercial","Operación","Cierre y control","Abastecimiento","Recursos compartidos","Configuración"].map(group=>{
    const groupLinks=activeCompany?links.filter(link=>link.group===group&&link.visible):[];
    const active=groupLinks.some(link=>pathname===link.href||pathname.startsWith(`${link.href}/`));
    const groupState=expanded.path===navKey?expanded.groups:defaultGroups;
    const isOpen=groupState[group]??active;
    const appearance=navigationAppearance[group],GroupIcon=appearance.icon;
    const panelId=`${mobile?"mobile":"desktop"}-nav-${group.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9]+/g,"-").toLowerCase()}`;
    return groupLinks.length?<div className={`nav-group ${isOpen?"expanded":""}`} data-ui-tone={appearance.tone} key={group}><button type="button" className="nav-group-toggle" aria-expanded={isOpen} aria-controls={panelId} onClick={()=>setExpanded(old=>{
      const groups=old.path===navKey?old.groups:defaultGroups;
      return {path:navKey,groups:{...groups,[group]:!(groups[group]??active)}};
    })}><span className="nav-group-label"><GroupIcon size={14} strokeWidth={1.8} aria-hidden="true"/>{group}</span><ChevronDown size={16}/></button><div id={panelId} className="nav-group-panel" inert={!isOpen}><div className="nav-group-inner">{groupLinks.map(link=><Link key={link.href} href={companyHref(link.href)} aria-current={activeHref===link.href?"page":undefined} onClick={()=>mobile&&setMobileOpen(false)} className={`nav-link ${activeHref===link.href?"active":""}`}><link.icon size={18} strokeWidth={1.9}/>{link.text}<NavPendingHint/></Link>)}</div></div></div>:null;
  })}</nav>;
  return <div className="app-shell" data-company={activeCompany??"selector"} data-section-tone={activeGroup?navigationAppearance[activeGroup].tone:"green"}>
    <a href="#workspace-content" className="workspace-skip">Ir al contenido</a>
    <aside className="sidebar">
      <Link href="/" className="brand brand-sidebar" aria-label="Seleccionar empresa">{activeCompany==="e_y_j"?<span className="eyj-brand"><strong>E y J</strong><small>Servicios Integrales</small></span>:activeCompany==="rerchar"?<Image src="/rerchar-logo-transparente.png" alt="RERCHAR Economía Circular" width={892} height={311} loading="eager" className="brand-art"/>:<span className="platform-brand"><Image src="/rerchar-logo-transparente.png" alt="RERCHAR" width={892} height={311} loading="eager"/><i aria-hidden="true"/><strong>E y J</strong></span>}<span className="system-name"><strong>{selectedName??"OPERACIÓN INDUSTRIAL"}</strong><span>Plataforma operativa</span></span></Link>
      <button type="button" className="sidebar-search-trigger" onClick={event=>openSearch(event.currentTarget)}><Search size={18}/><span>Buscar módulo</span><kbd>⌘ K</kbd></button>
      <div className="sidebar-section-label">ESPACIO DE TRABAJO</div>
      {companyOptions}
      <div className="sidebar-section-label">NAVEGACIÓN</div>
      {nav()}
      <div className="sidebar-bottom"><div className="sidebar-security"><ShieldCheck size={18}/> Acceso protegido</div>
        <div className="profile"><span className="profile-avatar">{actor.name.trim().slice(0, 1).toUpperCase()}</span><span className="profile-info"><strong>{actor.name}</strong><small>{actor.role === "operaciones" ? "Operaciones" : actor.role === "conductor" ? "Conductor" : actor.role === "cliente" ? "Cliente" : "Administración"}</small></span></div>
        <form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form>
      </div>
    </aside>
    <div className="main-area">
      <header className="topbar"><Link href={activeCompany?`/empresa/${activeCompany}`:"/"} className="mobile-brand" aria-label={selectedName?`Panel de ${selectedName}`:"Seleccionar empresa"}>{activeCompany==="rerchar"?<Image src="/rerchar-logo-transparente.png" alt="" width={892} height={311} loading="eager" className="mobile-brand-logo"/>:activeCompany==="e_y_j"?<span className="mobile-brand-eyj" aria-hidden="true">E y J</span>:<span className="mobile-brand-combined"><Image src="/rerchar-logo-transparente.png" alt="" width={892} height={311} loading="eager"/><i aria-hidden="true"/><strong>E y J</strong></span>}<span className="mobile-brand-copy"><strong>{activeCompany==="rerchar"?"RERCHAR":activeCompany==="e_y_j"?"Servicios Integrales":"Plataforma operativa"}</strong><small>{activeCompany==="rerchar"?"GESTIÓN DE MATERIALES":activeCompany==="e_y_j"?"SERVICIOS INDUSTRIALES":"RERCHAR · E Y J"}</small></span></Link><nav className="workspace-breadcrumb" aria-label="Ubicación actual"><Link href={activeCompany?`/empresa/${activeCompany}`:"/"}><span className="workspace-company-dot" aria-hidden="true"/>{selectedName??"Empresas"}</Link><span aria-hidden="true">/</span><span>{activeGroup??"Vista general"}</span>{activeLink&&<><span aria-hidden="true">/</span><strong aria-current="page">{activeLink.text}</strong></>}</nav><div className="topbar-actions"><button type="button" className="topbar-search-trigger" onClick={event=>openSearch(event.currentTarget)} aria-label="Buscar"><Search size={16}/><span>Buscar módulos</span><kbd>⌘ K</kbd></button><span className="topbar-user"><span className="topbar-avatar" aria-hidden="true">{actor.name.trim().slice(0,1).toUpperCase()}</span>{actor.name}</span></div>
        <button type="button" ref={mobileToggle} className="mobile-nav-trigger" aria-label="Abrir menú" aria-expanded={mobileOpen} aria-controls="mobile-navigation" onClick={()=>{setCompanyOpen(!activeCompany);setMobileOpen(true);}}><Menu size={22}/></button>
      </header>
      <main id="workspace-content" tabIndex={-1} className="page-content">{children}</main>
    </div>
    {mobileOpen&&<div className="mobile-nav-layer"><button type="button" className="mobile-nav-backdrop" aria-label="Cerrar menú" onClick={()=>{setMobileOpen(false);mobileToggle.current?.focus();}}/><aside ref={mobileDrawer} id="mobile-navigation" role="dialog" aria-modal="true" aria-label="Menú de navegación" className="mobile-nav-drawer"><div className="mobile-nav-heading"><div><small>PLATAFORMA OPERATIVA</small><strong>{selectedName??"Elija una empresa"}</strong></div><button type="button" ref={mobileClose} aria-label="Cerrar menú" onClick={()=>{setMobileOpen(false);mobileToggle.current?.focus();}}><X size={21}/></button></div><div className="mobile-nav-scroll"><div className="mobile-nav-caption">Cambiar empresa</div>{companyOptions}<button type="button" className="mobile-search-trigger" onClick={event=>openSearch(event.currentTarget)}><Search size={18}/> Buscar un módulo</button><div className="mobile-nav-caption">Navegación</div>{nav(true)}<div className="mobile-nav-footer"><span>{actor.name} · {actor.role==="admin"?"Administración":actor.role==="operaciones"?"Operaciones":actor.role==="conductor"?"Conductor":"Cliente"}</span><form action={logoutAction}><SubmitButton className="logout"><LogOut size={17}/> Cerrar sesión</SubmitButton></form></div></div></aside></div>}
    <GlobalSearch open={searchOpen} onClose={()=>setSearchOpen(false)} items={searchItems} returnFocusRef={searchReturnFocus}/>
  </div>;
}
