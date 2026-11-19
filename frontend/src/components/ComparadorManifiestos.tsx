"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { AlertCircle, CheckCircle, FileText, Loader2, Upload } from "lucide-react";
import { API_URL } from "@/lib/api";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { Modal } from "@/components/ui/modal";
import { LoadingModal } from "@/components/ui/loading-modal";
import { ZonaArchivo } from "@/components/ZonaArchivo";

export function ComparadorManifiestos() {
  const router = useRouter();
  const { recargarLista } = useManifiesto();

  const [archivoGeneral, setArchivoGeneral] = useState<File | null>(null);
  const [archivoVentas, setArchivoVentas] = useState<File | null>(null);
  const [comparando, setComparando] = useState(false);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalContenido, setModalContenido] = useState({
    titulo: "",
    mensaje: "",
    tipo: "exito",
  });

  const handleComparar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivoGeneral || !archivoVentas) return;

    setComparando(true);

    try {
      const formData = new FormData();
      formData.append("file_general", archivoGeneral);
      formData.append("file_ventas", archivoVentas);

      const res = await fetch(`${API_URL}/manifiestos/comparar-manifiestos`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${Cookies.get("token")}`,
        },
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Error al comparar manifiestos");
      }

      setModalContenido({
        titulo: "¡Comparación exitosa!",
        mensaje: "Se han restado los manifiestos y el resultado se ha guardado.",
        tipo: "exito",
      });
      setModalAbierto(true);

      if (recargarLista) recargarLista();
    } catch (err: any) {
      setModalContenido({
        titulo: "Error en la comparación",
        mensaje: err.message || "Error en la comparación",
        tipo: "error",
      });
      setModalAbierto(true);
    } finally {
      setComparando(false);
    }
  };

  return (
    <>
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <h2 className="text-xl font-semibold mb-2 flex items-center gap-2 text-slate-900">
          <FileText className="w-5 h-5 text-orange-500" /> Restar manifiesto (comparar)
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          Sube el manifiesto general y el de ventas. Te devolveremos un Excel con los HBLs del general que NO están en el de ventas.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">Manifiesto general</span>
            <ZonaArchivo
              id="archivo-general"
              archivo={archivoGeneral}
              onArchivo={setArchivoGeneral}
            />
          </div>

          <div>
            <span className="block text-sm font-medium text-slate-700 mb-2">Manifiesto de ventas</span>
            <ZonaArchivo
              id="archivo-ventas"
              archivo={archivoVentas}
              onArchivo={setArchivoVentas}
            />
          </div>
        </div>

        <button
          onClick={handleComparar}
          disabled={!archivoGeneral || !archivoVentas || comparando}
          className="w-full font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:bg-slate-300 text-white"
        >
          {comparando ? (
            <><Loader2 className="w-5 h-5 animate-spin" /> Comparando...</>
          ) : (
            <><Upload className="w-5 h-5" /> Comparar y Guardar</>
          )}
        </button>
      </div>

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={modalContenido.titulo}
      >
        <div className="flex flex-col items-center text-center space-y-4">
          {modalContenido.tipo === "exito" ? (
            <CheckCircle className="w-12 h-12 text-green-500" />
          ) : (
            <AlertCircle className="w-12 h-12 text-red-500" />
          )}
          <p className="text-slate-600">{modalContenido.mensaje}</p>
          <button
            onClick={() => {
              setModalAbierto(false);
              if (modalContenido.tipo === "exito") router.push("/manifiestos");
            }}
            className="mt-4 px-6 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors"
          >
            Aceptar
          </button>
        </div>
      </Modal>

      <LoadingModal
        isOpen={comparando}
        text="Comparando manifiestos..."
      />
    </>
  );
}
