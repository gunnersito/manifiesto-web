"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Cookies from "js-cookie";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  LayoutDashboard,
  List,
  LogOut,
  MapPin,
  Menu,
  Package,
  Route,
  Settings,
  Upload,
  User,
  X,
} from "lucide-react";
import { logoutRequest } from "@/lib/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import SelectorManifiesto from "@/components/SelectorManifiesto";

interface ItemMenu {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface GrupoMenu {
  titulo: string;
  items: ItemMenu[];
}

// Agrupado por uso: lo que se hace con los manifiestos, el trabajo diario de
// reparto, el análisis y lo de la cuenta.
const GRUPOS: GrupoMenu[] = [
  {
    titulo: "Manifiestos",
    items: [
      { href: "/", label: "Subir", icon: Upload },
      { href: "/manifiestos", label: "Manifiestos", icon: FolderOpen },
    ],
  },
  {
    titulo: "Operación",
    items: [
      { href: "/registros", label: "Registros", icon: List },
      { href: "/provincias", label: "Provincias", icon: MapPin },
      { href: "/rutas", label: "Rutas", icon: Route },
    ],
  },
  {
    titulo: "Análisis",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/exportar", label: "Exportar", icon: Download },
    ],
  },
  {
    titulo: "Sistema",
    items: [
      { href: "/configuracion", label: "Configuración", icon: Settings },
      { href: "/perfil", label: "Mi Perfil", icon: User },
    ],
  },
];

export default function Sidebar() {
  // `collapsed` solo afecta a escritorio: en móvil el menú es un drawer.
  const [collapsed, setCollapsed] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const pathname = usePathname();
  const [username, setUsername] = useState("");

  useEffect(() => {
    // Cargar estado desde localStorage
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") {
      setCollapsed(true);
    }
    // Verificar rol solo en el cliente
    setIsAdmin(Cookies.get("role") === "admin");
    setUsername(Cookies.get("username") || "Usuario");
  }, []);

  // Al cambiar de sección se cierra el drawer
  useEffect(() => {
    setAbierto(false);
  }, [pathname]);

  const toggleCollapsed = () => {
    const nuevoEstado = !collapsed;
    setCollapsed(nuevoEstado);
    localStorage.setItem("sidebar-collapsed", String(nuevoEstado));
  };

  const esActiva = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const itemActivo = GRUPOS.flatMap((grupo) => grupo.items).find((item) =>
    esActiva(item.href)
  );

  // Los invitados no ven "Subir" ni "Configuración".
  const puedeVer = (href: string) =>
    isAdmin || (href !== "/" && href !== "/configuracion");

  return (
    <TooltipProvider delay={200}>
      {/* Barra superior: solo en móvil */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white px-3 lg:hidden">
        <button
          onClick={() => setAbierto(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
          aria-label="Abrir menú"
          aria-expanded={abierto}
          aria-controls="sidebar-principal"
        >
          <Menu className="w-5 h-5" />
        </button>
        <Link href="/manifiestos" className="flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          <span className="font-semibold text-slate-900">Manifiesto</span>
        </Link>
        <span className="ml-auto truncate text-xs font-medium text-slate-500">
          {itemActivo?.label ?? ""}
        </span>
      </header>

      {/* Fondo del drawer en móvil */}
      {abierto && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
          onClick={() => setAbierto(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="sidebar-principal"
        className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-300 lg:sticky lg:top-0 lg:z-auto lg:translate-x-0 ${
          abierto ? "translate-x-0" : "-translate-x-full"
        } ${collapsed ? "lg:w-16" : "lg:w-64"}`}
      >
        {/* Cabecera: logo + botones */}
        <div
          className={`h-16 border-b border-slate-200 flex items-center px-2 ${
            collapsed ? "justify-between lg:justify-center" : "justify-between"
          }`}
        >
          <div
            className={`flex items-center gap-2 overflow-hidden pl-1 ${
              collapsed ? "lg:hidden" : ""
            }`}
          >
            <Package className="w-6 h-6 text-primary flex-shrink-0" />
            <span className="font-bold text-slate-900 whitespace-nowrap">
              Manifiesto
            </span>
          </div>

          <button
            onClick={toggleCollapsed}
            className="w-9 h-9 hidden lg:flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>

          <button
            onClick={() => setAbierto(false)}
            className="w-9 h-9 flex lg:hidden items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
            aria-label="Cerrar menú"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Selector de manifiesto global */}
        <div className={collapsed ? "lg:hidden" : ""}>
          <SelectorManifiesto />
        </div>
        {/* Colapsado en escritorio queda solo el icono, pero sigue accesible */}
        {collapsed && (
          <div className="hidden lg:block">
            <SelectorManifiesto compacto />
          </div>
        )}

        {/* Navegación agrupada por secciones */}
        <nav className="flex-1 overflow-y-auto py-2">
          {GRUPOS.map((grupo, indice) => {
            const items = grupo.items.filter((item) => puedeVer(item.href));
            if (items.length === 0) return null;

            return (
              <div key={grupo.titulo} className="pb-1">
                {/* En móvil el grupo siempre se rotula; colapsado en escritorio
                    se sustituye por un separador. */}
                <div
                  className={`px-4 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 ${
                    collapsed ? "lg:hidden" : ""
                  }`}
                >
                  {grupo.titulo}
                </div>
                {collapsed && indice > 0 && (
                  <div className="mx-3 mb-2 hidden border-t border-slate-200 lg:block" />
                )}

                <div className="space-y-1">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const isActive = esActiva(item.href);

                    const contenidoBoton = (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setAbierto(false)}
                        aria-current={isActive ? "page" : undefined}
                        className={`flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary font-medium"
                            : "text-slate-700 hover:bg-slate-100"
                        } ${collapsed ? "lg:justify-center" : ""}`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span
                          className={`text-sm whitespace-nowrap ${
                            collapsed ? "lg:hidden" : ""
                          }`}
                        >
                          {item.label}
                        </span>
                      </Link>
                    );

                    if (collapsed) {
                      return (
                        <Tooltip key={item.href}>
                          <TooltipTrigger>{contenidoBoton}</TooltipTrigger>
                          <TooltipContent side="right">{item.label}</TooltipContent>
                        </Tooltip>
                      );
                    }

                    return contenidoBoton;
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        {/* Cerrar sesión y enlace al perfil */}
        <div className="p-3 border-t border-slate-200">
          <div
            className={`flex items-center gap-2 ${
              collapsed ? "justify-center" : "justify-between"
            }`}
          >
            <Link
              href="/perfil"
              className={`text-xs text-slate-500 hover:text-primary truncate max-w-[100px] transition-colors ${
                collapsed ? "lg:hidden" : ""
              }`}
              title="Ir a mi perfil"
            >
              {username}
            </Link>
            <button
              onClick={logoutRequest}
              className="flex items-center gap-2 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
              <span
                className={`text-xs font-medium ${collapsed ? "lg:hidden" : ""}`}
              >
                Salir
              </span>
            </button>
          </div>
        </div>
      </aside>
    </TooltipProvider>
  );
}
