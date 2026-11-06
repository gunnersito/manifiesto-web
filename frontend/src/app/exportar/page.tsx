"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import AutocompleteUbicacion from "@/components/AutocompleteUbicacion";
import {
  Download,
  Upload,
  FileSpreadsheet,
  Truck,
  MapPin,
  Loader2,
  AlertCircle,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import {
  exportarProvinciaPorId,
  exportarHojaRutaPorId,
  exportarPorMunicipiosPorId,
  exportarTodasProvinciasPorId,
  compararManifiestos,
} from "@/lib/api";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ExportarPage() {
  const [menuAbierto, setMenuAbierto] = useState(false);
  const router = useRouter();
  const { metadata, manifiestoId, manifiestos, seleccionarManifiesto, recargarLista } = useManifiesto();
  // 👇 Ordenar los manifiestos por el número que tienen en el nombre
  const manifiestosOrdenados = [...manifiestos].sort((a, b) => {
    // Extraemos los números del nombre del archivo (ej: "Manifiesto_2622.xlsx" -> 2622)
    const numA = parseInt(a.nombre_archivo.replace(/\D/g, "")) || 0;
    const numB = parseInt(b.nombre_archivo.replace(/\D/g, "")) || 0;
    return numA - numB;
  });
  const [provinciaSel, setProvinciaSel] = useState<string>("");
  const [exportando, setExportando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const provincias = metadata?.resumen.map((p) => p.provincia) || [];

  const handleExportar = async (
    tipo: string,
    fn: () => Promise<void>
  ) => {
    setExportando(tipo);
    setError(null);
    try {
      await fn();
    } catch (err: any) {
      setError(err.message || "Error al exportar");
    } finally {
      setExportando(null);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
                        {/* Header con Selector */}
        <div className="flex items-end justify-between flex-wrap gap-4">
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">📥 Exportar</h1>
            <p className="text-slate-600 text-sm mt-1">
              Selecciona un manifiesto para exportar sus datos
            </p>
          </div>

          {/* Selector de manifiesto */}
          <div className="relative">
              <button
                type="button"
                onClick={() => setMenuAbierto(!menuAbierto)}
                className="w-full flex items-center justify-between h-10 px-3 border border-slate-300 rounded-lg bg-white hover:border-slate-400 transition-colors text-sm"
              >
                <span className="truncate font-medium text-slate-900">
                  {metadata ? `${metadata.nombre_archivo} (${metadata.total_filas} HBLs)` : "Selecciona un manifiesto..."}
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 flex-shrink-0 transition-transform ${menuAbierto ? "rotate-180" : ""}`} />
              </button>

              {menuAbierto && (
                <>
                  {/* Capa invisible para cerrar al hacer clic fuera */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} />

                                                      <div
                    className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg"
                    style={{ maxHeight: "200px", overflowY: "auto" }}
                  >
                    {manifiestosOrdenados.map((m) => {  {/* 👈 Cambiado aquí */}
                      const esActivo = m.id === manifiestoId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={async () => {
                            await seleccionarManifiesto(m.id);
                            setMenuAbierto(false);
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 transition-colors truncate ${
                            esActivo ? "bg-blue-50 text-blue-700 font-medium" : "text-slate-700"
                          }`}
                        >
                          {m.nombre_archivo} ({m.total_filas} HBLs)
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

                {/* Bloque 1: Todas (Solo si hay manifiesto) */}
        {metadata && manifiestoId && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <FileSpreadsheet className="w-6 h-6 text-blue-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-slate-900 mb-1">
                  Exportar todas las provincias
                </h2>
                <p className="text-sm text-slate-600 mb-4">
                  Genera un Excel con una hoja por provincia ({metadata.total_provincias} en total),
                  más una hoja de resumen general.
                </p>
                <button
                  onClick={() =>
                  handleExportar("todas", () =>
                  exportarTodasProvinciasPorId(manifiestoId!, metadata?.nombre_archivo || `manifiesto_${manifiestoId}`
    )
  )
}
                  disabled={exportando !== null}
                  className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
                >
                  {exportando === "todas" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generando...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Descargar Excel completo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bloque 2: Por provincia */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <MapPin className="w-6 h-6 text-green-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Exportar por provincia
              </h2>
              <p className="text-sm text-slate-600">
                Selecciona una provincia y descarga su manifiesto, hoja de ruta o por municipios.
              </p>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Provincia
            </label>
                        <AutocompleteUbicacion
              values={provinciaSel ? [provinciaSel] : []}
              onChange={(vals) => setProvinciaSel(vals[0] || "")}
              opciones={provincias}
              provincias={provincias}
              placeholder="— Selecciona una provincia —"
            />
          </div>

          {provinciaSel && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-6 pt-6 border-t border-slate-200">
              <button
                onClick={() =>
                  handleExportar("manifiesto", () =>
                    exportarProvinciaPorId(manifiestoId!, provinciaSel, metadata?.nombre_archivo || "")
                  )
                }
                disabled={exportando !== null}
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg hover:border-blue-400 hover:bg-blue-50/30 transition-colors text-left disabled:opacity-50"
              >
                <FileSpreadsheet className="w-5 h-5 text-blue-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 text-sm">
                    Manifiesto
                  </div>
                  <div className="text-xs text-slate-500">Excel completo</div>
                </div>
                {exportando === "manifiesto" && (
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                )}
              </button>

              <button
                onClick={() =>
                  handleExportar("ruta", () =>
                    exportarHojaRutaPorId(manifiestoId!, provinciaSel, metadata?.nombre_archivo || "")
                  )
                }
                disabled={exportando !== null}
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg hover:border-green-400 hover:bg-green-50/30 transition-colors text-left disabled:opacity-50"
              >
                <Truck className="w-5 h-5 text-green-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 text-sm">
                    Hoja de ruta
                  </div>
                  <div className="text-xs text-slate-500">Para el repartidor</div>
                </div>
                {exportando === "ruta" && (
                  <Loader2 className="w-4 h-4 animate-spin text-green-600" />
                )}
              </button>

              <button
                onClick={() =>
                  handleExportar("municipios", () =>
                    exportarPorMunicipiosPorId(manifiestoId!, provinciaSel, metadata?.nombre_archivo || "")
                  )
                }
                disabled={exportando !== null}
                className="flex items-center gap-3 p-4 border border-slate-200 rounded-lg hover:border-purple-400 hover:bg-purple-50/30 transition-colors text-left disabled:opacity-50"
              >
                <MapPin className="w-5 h-5 text-purple-600 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-slate-900 text-sm">
                    Por municipios
                  </div>
                  <div className="text-xs text-slate-500">
                    Una hoja por municipio
                  </div>
                </div>
                {exportando === "municipios" && (
                  <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Tip */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          💡 <b>Tip:</b> Los Excel exportados incluyen los estados actuales
          (Pendiente, Despachada, Devuelto Almacén, Entregada) que hayas marcado.
        </div>
      </div>
    </main>
  );
}