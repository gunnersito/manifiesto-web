"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { toast } from "sonner";
import {
  Check,
  ChevronsUpDown,
  FileSpreadsheet,
  FolderOpen,
  Loader2,
  Plus,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";

// Selector global: cambia el manifiesto activo desde cualquier sección.
// Con `compacto` se reduce a un icono (menú colapsado en escritorio).
export default function SelectorManifiesto({
  compacto = false,
}: {
  compacto?: boolean;
}) {
  const {
    metadata,
    manifiestos,
    manifiestoId,
    seleccionarManifiesto,
    loading,
  } = useManifiesto();
  const [abierto, setAbierto] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    setIsAdmin(Cookies.get("role") === "admin");
  }, []);

  if (!metadata && manifiestos.length === 0) {
    return null;
  }

  const manifiestosOrdenados = [...manifiestos].sort((a, b) => {
    const numA = parseInt(a.nombre_archivo.replace(/\D/g, "")) || 0;
    const numB = parseInt(b.nombre_archivo.replace(/\D/g, "")) || 0;
    return numA - numB;
  });

  const cambiar = async (id: number) => {
    setAbierto(false);
    if (id === manifiestoId) return;
    try {
      await seleccionarManifiesto(id);
    } catch {
      toast.error("No se pudo cambiar de manifiesto");
    }
  };

  return (
    <div className={compacto ? "relative mb-3 px-2" : "relative mx-2 mb-3"}>
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        title={compacto ? metadata?.nombre_archivo : undefined}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label="Cambiar manifiesto activo"
        className={
          compacto
            ? "mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 transition-colors hover:border-slate-300 hover:bg-slate-100"
            : "flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition-colors hover:border-slate-300 hover:bg-slate-100"
        }
      >
        <FileSpreadsheet className="w-4 h-4 flex-shrink-0 text-primary" />
        {!compacto && (
          <>
            <div className="min-w-0 flex-1">
              <div
                className="truncate text-xs font-medium text-slate-900"
                title={metadata?.nombre_archivo}
              >
                {metadata?.nombre_archivo ?? "Selecciona un manifiesto"}
              </div>
              <div className="text-[10px] text-slate-500">
                {metadata
                  ? `${metadata.total_filas} HBLs · ${manifiestos.length} guardados`
                  : `${manifiestos.length} guardados`}
              </div>
            </div>
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-slate-400" />
            ) : (
              <ChevronsUpDown className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
            )}
          </>
        )}
      </button>

      {abierto && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setAbierto(false)}
            aria-hidden="true"
          />
          <div
            role="listbox"
            aria-label="Manifiestos guardados"
            className={
              compacto
                ? "absolute left-full top-0 z-50 ml-2 max-h-72 w-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
                : "absolute left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
            }
          >
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Cambiar manifiesto
            </div>
            {manifiestosOrdenados.map((m) => {
              const esActivo = m.id === manifiestoId;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="option"
                  aria-selected={esActivo}
                  onClick={() => cambiar(m.id)}
                  disabled={loading}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors disabled:opacity-60 ${
                    esActivo
                      ? "bg-primary/5 font-medium text-primary"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <Check
                    className={`w-3.5 h-3.5 flex-shrink-0 ${
                      esActivo ? "text-primary" : "text-transparent"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate" title={m.nombre_archivo}>
                    {m.nombre_archivo}
                  </span>
                  <span className="flex-shrink-0 text-[10px] text-slate-400">
                    {m.total_filas} HBLs
                  </span>
                </button>
              );
            })}

            <div className="mt-1 space-y-1 border-t border-slate-100 pt-1">
              <Link
                href="/manifiestos"
                onClick={() => setAbierto(false)}
                className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/5"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Ver todos los manifiestos
              </Link>
              {isAdmin && (
                <Link
                  href="/"
                  onClick={() => setAbierto(false)}
                  className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-primary transition-colors hover:bg-primary/5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Subir nuevo manifiesto
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
