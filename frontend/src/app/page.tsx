"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, FileSpreadsheet, FileText, Loader2, Upload, X } from "lucide-react";
import { API_URL, subirManifiesto } from "@/lib/api";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { Modal } from "@/components/ui/modal";
import { LoadingModal } from "@/components/ui/loading-modal";
import Cookies from "js-cookie";

export default function Home() {
  const router = useRouter();
  const { recargarLista } = useManifiesto();

  // Estados para Subir normal
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  // Estados para Comparar
  const [archivoGeneral, setArchivoGeneral] = useState<File | null>(null);
  const [archivoVentas, setArchivoVentas] = useState<File | null>(null);
  const [comparando, setComparando] = useState(false);

  // Estados para el Modal de Notificación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalContenido, setModalContenido] = useState({ titulo: "", mensaje: "", tipo: "exito" });

  // 👇 EL GUARDIÁN DEFINITIVO 👇
  useEffect(() => {
    const token = Cookies.get("token");
    if (!token) {
      router.replace("/login");
    }
  }, [router]);

  // Si no hay token, no renderizamos NADA (evita el parpadeo y la entrada directa)
  if (!Cookies.get("token")) {
    return null;
  }

  const handleSubir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo) return;

    setSubiendo(true);

    try {
      await subirManifiesto(archivo);

      setModalContenido({
        titulo: "¡Manifiesto subido!",
        mensaje: "El archivo se ha procesado y guardado correctamente en el sistema.",
        tipo: "exito"
      });
      setModalAbierto(true);

      if (recargarLista) recargarLista();

    } catch (err: any) {
      setModalContenido({
        titulo: "Error al subir",
        mensaje: err.response?.data?.detail || err.message || "No se pudo procesar el archivo.",
        tipo: "error"
      });
      setModalAbierto(true);
    } finally {
      setSubiendo(false);
    }
  };

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
          "Authorization": `Bearer ${Cookies.get("token")}`
        },
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.detail || "Error al comparar manifiestos");
      }

      setModalContenido({
        titulo: "¡Comparación exitosa!",
        mensaje: "Se han restado los manifiestos y el resultado se ha guardado.",
        tipo: "exito"
      });
      setModalAbierto(true);

      if (recargarLista) recargarLista();
      
    } catch (err: any) {
      setModalContenido({
        titulo: "Error en la comparación",
        mensaje: err.message || "Error en la comparación",
        tipo: "error"
      });
      setModalAbierto(true);
    } finally {
      setComparando(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        <div>
          <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
            <Upload className="w-7 h-7 text-primary" />
            Subir manifiesto
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Sube tu archivo Excel para procesarlo y guardarlo en el sistema
          </p>
        </div>

        {/* Tarjeta de Subida Normal */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubir} className="space-y-6">
            <ZonaArchivo
              id="archivo-manifiesto"
              archivo={archivo}
              onArchivo={setArchivo}
              grande
            />
            <button
              type="submit"
              disabled={!archivo || subiendo}
              className="w-full bg-primary hover:bg-primary/90 disabled:bg-slate-300 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              {subiendo ? (
                <><Loader2 className="w-5 h-5 animate-spin" /> Procesando archivo...</>
              ) : (
                <><Upload className="w-5 h-5" /> Subir y Procesar</>
              )}
            </button>
          </form>
        </div>

        {/* Tarjeta de Restar Manifiesto (Comparar) */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <h2 className="text-xl font-semibold mb-2 flex items-center gap-2 text-slate-900">
            <FileText className="w-5 h-5 text-orange-500" /> Restar Manifiesto (Comparar)
          </h2>
          <p className="text-sm text-slate-500 mb-6">
            Sube el manifiesto general y el de ventas. Te devolveremos un Excel con los HBLs del general que NO están en el de ventas.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {/* Manifiesto General */}
            <div>
              <span className="block text-sm font-medium text-slate-700 mb-2">Manifiesto general</span>
              <ZonaArchivo
                id="archivo-general"
                archivo={archivoGeneral}
                onArchivo={setArchivoGeneral}
              />
            </div>

            {/* Manifiesto de Ventas */}
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
            className={`w-full font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
              (!archivoGeneral || !archivoVentas) 
                ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                : "bg-primary hover:bg-primary/90 text-white shadow-md hover:shadow-lg"
            }`}
          >
            {comparando ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Comparando...</>
            ) : (
              <><Upload className="w-5 h-5" /> Comparar y Guardar</>
            )}
          </button>
        </div>
      </div>
      
      {/* MODAL DE NOTIFICACIÓN GLOBAL */}
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
        isOpen={subiendo || comparando}
        text={subiendo ? "Subiendo y procesando el manifiesto..." : "Comparando manifiestos..."}
      />
    </main>
  );
}

// ============================================================
// COMPONENTE: zona para elegir o arrastrar un archivo
// ============================================================
function ZonaArchivo({
  id,
  archivo,
  onArchivo,
  grande = false,
}: {
  id: string;
  archivo: File | null;
  onArchivo: (archivo: File | null) => void;
  grande?: boolean;
}) {
  const [arrastrando, setArrastrando] = useState(false);

  const quitar = (evento: React.MouseEvent) => {
    evento.preventDefault();
    evento.stopPropagation();
    onArchivo(null);
  };

  const soltar = (evento: React.DragEvent) => {
    evento.preventDefault();
    setArrastrando(false);
    const soltado = evento.dataTransfer.files?.[0];
    if (soltado) onArchivo(soltado);
  };

  return (
    <label
      htmlFor={id}
      onDragOver={(evento) => {
        evento.preventDefault();
        setArrastrando(true);
      }}
      onDragLeave={() => setArrastrando(false)}
      onDrop={soltar}
      className={`flex cursor-pointer rounded-lg border-2 border-dashed transition-colors ${
        arrastrando
          ? "border-primary bg-primary/5"
          : "border-slate-300 hover:border-primary/60 hover:bg-slate-50"
      } ${
        grande
          ? "flex-col items-center gap-2 p-10 text-center"
          : "items-center gap-3 px-4 py-3 text-left"
      }`}
    >
      <input
        key={archivo ? "con-archivo" : "sin-archivo"}
        id={id}
        type="file"
        accept=".xlsx, .xls, .csv"
        onChange={(e) => onArchivo(e.target.files?.[0] ?? null)}
        className="sr-only"
      />

      {grande ? (
        <>
          <Upload className="w-12 h-12 text-slate-400" />
          <p className="font-medium text-slate-700">
            {archivo
              ? archivo.name
              : "Arrastra tu archivo aquí o haz clic para buscar"}
          </p>
          <p className="text-sm text-slate-500">
            Formatos soportados: .xlsx, .xls, .csv
          </p>
          {archivo && (
            <button
              type="button"
              onClick={quitar}
              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 transition-colors hover:text-red-600"
            >
              <X className="w-3.5 h-3.5" />
              Quitar archivo
            </button>
          )}
        </>
      ) : (
        <>
          <FileSpreadsheet className="w-5 h-5 flex-shrink-0 text-slate-400" />
          <span
            className={`min-w-0 flex-1 truncate text-sm ${
              archivo ? "font-medium text-slate-900" : "text-slate-500"
            }`}
            title={archivo?.name}
          >
            {archivo ? archivo.name : "Ningún archivo elegido"}
          </span>
          {archivo ? (
            <button
              type="button"
              onClick={quitar}
              aria-label="Quitar archivo"
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <span className="flex-shrink-0 text-xs font-medium text-primary">
              Elegir
            </span>
          )}
        </>
      )}
    </label>
  );
}