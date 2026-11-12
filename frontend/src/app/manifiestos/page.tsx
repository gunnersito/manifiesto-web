"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Cookies from "js-cookie";
import { Modal } from "@/components/ui/modal";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Trash2,
  Upload,
  CheckCircle,
  Calendar,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";

export default function ManifiestosPage() {
  const router = useRouter();
  const {
    manifiestos,
    manifiestoId,
    seleccionarManifiesto,
    eliminarManifiestoPorId,
    loadingManifiestos,
  } = useManifiesto();

  // 👇 Ordenar los manifiestos por el número que tienen en el nombre
  const manifiestosOrdenados = [...manifiestos].sort((a, b) => {
    const numA = parseInt(a.nombre_archivo.replace(/\D/g, "")) || 0;
    const numB = parseInt(b.nombre_archivo.replace(/\D/g, "")) || 0;
    return numA - numB;
  });
  const [eliminando, setEliminando] = useState<number | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [manifiestoAEliminar, setManifiestoAEliminar] = useState<number | null>(null);

  useEffect(() => {
    setIsAdmin(Cookies.get("role") === "admin");
  }, []);

  const handleSeleccionar = async (id: number) => {
    await seleccionarManifiesto(id);
  };

  const handleEliminar = async () => {
    if (!manifiestoAEliminar) return;

    setEliminando(manifiestoAEliminar);
    try {
      await eliminarManifiestoPorId(manifiestoAEliminar);
    } catch (err) {
      toast.error("Error al eliminar el manifiesto");
    } finally {
      setEliminando(null);
      setManifiestoAEliminar(null); // Cerramos el modal
    }
  };

  if (loadingManifiestos) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-5xl mx-auto text-center py-12 text-slate-500">
          Cargando manifiestos...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">
              📂 Mis Manifiestos
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Tienes {manifiestos.length} manifiesto(s) guardado(s)
            </p>
          </div>
          {isAdmin && (
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              <Upload className="w-4 h-4" />
              Subir nuevo
            </Link>
          )}
        </div>

        {/* Lista de tarjetas */}
        {manifiestos.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <div className="text-6xl mb-4">📄</div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              No hay manifiestos guardados
            </h2>
            <p className="text-slate-600 mb-6">
              Sube tu primer archivo Excel para comenzar.
            </p>
            {isAdmin && (
              <Link
                href="/"
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
              >
                Ir a Subir
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {manifiestosOrdenados.map((m) => {
              const esActivo = m.id === manifiestoId;
              return (
                <div
                  key={m.id}
                  onClick={() => handleSeleccionar(m.id)}
                  className={`bg-white rounded-xl border-2 p-5 cursor-pointer transition-all hover:shadow-md ${
                    esActivo
                      ? "border-blue-500 ring-2 ring-blue-100"
                      : "border-slate-200 hover:border-blue-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet
                        className={`w-5 h-5 flex-shrink-0 ${
                          esActivo ? "text-blue-600" : "text-slate-400"
                        }`}
                      />
                      <h3
                        className={`text-sm font-semibold truncate ${
                          esActivo ? "text-blue-700" : "text-slate-900"
                        }`}
                        title={m.nombre_archivo}
                      >
                        {m.nombre_archivo}
                      </h3>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setManifiestoAEliminar(m.id);
                            }}
                            disabled={eliminando === m.id}
                            className="p-1.5 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-600 transition-colors flex-shrink-0 disabled:opacity-50"
                            title="Eliminar manifiesto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-500 mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {new Date(m.fecha_subida).toLocaleDateString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-100">
                    <div>
                      <div className="text-lg font-bold text-slate-900">
                        {m.total_filas}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase">
                        HBLs
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-900">
                        {m.total_paradas}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase">
                        Paradas
                      </div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-900">
                        {m.total_bultos}
                      </div>
                      <div className="text-[10px] text-slate-500 uppercase">
                        Bultos
                      </div>
                    </div>
                  </div>

                  {esActivo && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-blue-700">
                      <CheckCircle className="w-3.5 h-3.5" />
                      Manifiesto activo
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL PARA ELIMINAR MANIFIESTO */}
      <Modal
          isOpen={manifiestoAEliminar !== null}
          onClose={() => setManifiestoAEliminar(null)}
          title="Eliminar manifiesto"
      >
        <div className="flex flex-col items-center text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500" />
          <p className="text-slate-600">
            ¿Estás seguro de que quieres eliminar este manifiesto? Esta acción no se puede deshacer y se borrarán todos sus datos.
          </p>
          <div className="flex justify-end gap-3 w-full mt-4">
            <button
                onClick={() => setManifiestoAEliminar(null)}
                className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors"
            >
              Cancelar
            </button>
            <button
                onClick={handleEliminar}
                disabled={eliminando !== null}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {eliminando ? "Eliminando..." : "Eliminar"}
            </button>
          </div>
        </div>
      </Modal>
    </main>
  );
}