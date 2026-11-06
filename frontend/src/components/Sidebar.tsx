"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Cookies from "js-cookie";
import { LogOut, User } from "lucide-react"; // 👈 Añadimos el icono User
import { logoutRequest } from "@/lib/api";
import {
  Upload,
  LayoutDashboard,
  List,
  MapPin,
  Download,
  Settings,
  ChevronLeft,
  ChevronRight,
  Package,
  FolderOpen,
} from "lucide-react";
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

const ITEMS: ItemMenu[] = [
  { href: "/", label: "Subir", icon: Upload },
  { href: "/manifiestos", label: "Manifiestos", icon: FolderOpen },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/registros", label: "Registros", icon: List },
  { href: "/provincias", label: "Provincias", icon: MapPin },
  { href: "/exportar", label: "Exportar", icon: Download },
  { href: "/configuracion", label: "Configuración", icon: Settings },
  { href: "/perfil", label: "Mi Perfil", icon: User }, // 👈 NUEVO ITEM AÑADIDO
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
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

  const toggleCollapsed = () => {
    const nuevoEstado = !collapsed;
    setCollapsed(nuevoEstado);
    localStorage.setItem("sidebar-collapsed", String(nuevoEstado));
  };

  return (
    <TooltipProvider delayDuration={200}>
      <aside
        className={`${
          collapsed ? "w-16" : "w-64"
        } bg-white border-r border-slate-200 flex flex-col transition-all duration-300 h-screen sticky top-0`}
      >
        {/* Cabecera: logo + botón toggle */}
        <div
          className={`h-16 border-b border-slate-200 flex items-center px-2 ${
            collapsed ? "justify-center" : "justify-between"
          }`}
        >
          {!collapsed && (
            <div className="flex items-center gap-2 overflow-hidden pl-1">
              <Package className="w-6 h-6 text-blue-600 flex-shrink-0" />
              <span className="font-bold text-slate-900 whitespace-nowrap">
                Manifiesto
              </span>
            </div>
          )}

          <button
            onClick={toggleCollapsed}
            className="w-9 h-9 flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors flex-shrink-0"
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <ChevronLeft className="w-5 h-5" />
            )}
          </button>
        </div>

        {/* Selector de manifiesto */}
        {!collapsed && <SelectorManifiesto />}

        {/* Navegación */}
        <nav className="flex-1 py-4 space-y-1">
          {ITEMS.filter((item) => {
            // Ocultar "Subir" a los invitados
            if (!isAdmin && item.href === "/") return false;
            // Ocultar "Configuración" a los invitados (opcional, pero muy recomendado)
            if (!isAdmin && item.href === "/configuracion") return false;
            return true;
          }).map((item) => {
            const Icon = item.icon;
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);

            const contenidoBoton = (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-slate-700 hover:bg-slate-100"
                } ${collapsed ? "justify-center" : ""}`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && (
                  <span className="text-sm whitespace-nowrap">{item.label}</span>
                )}
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
        </nav>

        {/* 👇 BOTÓN DE CERRAR SESIÓN Y ENLACE AL PERFIL 👇 */}
        <div className="p-3 border-t border-slate-200">
          <div className={`flex items-center ${collapsed ? "justify-center" : "justify-between"} gap-2`}>
            {!collapsed && (
              <Link href="/perfil" className="text-xs text-slate-500 hover:text-blue-600 truncate max-w-[100px] transition-colors" title="Ir a mi perfil">
                {username}
              </Link>
            )}
            <button
              onClick={logoutRequest}
              className="flex items-center gap-2 p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
              {!collapsed && <span className="text-xs font-medium">Salir</span>}
            </button>
          </div>
        </div>

      </aside>
    </TooltipProvider>
  );
}