"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { FileSpreadsheet, FolderOpen, Plus } from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";

export default function SelectorManifiesto() {
  const { metadata } = useManifiesto();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(Cookies.get("role") === "admin");
  }, []);

  if (!metadata) {
    return null;
  }

  return (
    <div className="mx-2 mb-3 space-y-1">
      {/* Manifiesto Activo */}
      <div className="w-full flex items-center justify-between gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <FileSpreadsheet className="w-4 h-4 text-blue-600 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <div
              className="text-xs font-medium text-slate-900 truncate"
              title={metadata.nombre_archivo}
            >
              {metadata.nombre_archivo}
            </div>
            <div className="text-[10px] text-slate-500">
              {metadata.total_filas} HBLs · {metadata.total_provincias} prov.
            </div>
          </div>
        </div>
      </div>

      {/* Botón para ir al historial */}
      <Link
        href="/manifiestos"
        className="flex items-center gap-2 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
      >
        <FolderOpen className="w-3.5 h-3.5" />
        Ver todos los manifiestos
      </Link>

      {/* Botón de subir (solo admin) */}
      {isAdmin && (
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Subir nuevo manifiesto
        </Link>
      )}
    </div>
  );
}