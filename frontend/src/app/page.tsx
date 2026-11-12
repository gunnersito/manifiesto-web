"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, Trash2 } from "lucide-react";
import { subirManifiesto } from "@/lib/api";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";

export default function Home() {
  const router = useRouter();
  const { recargarLista } = useManifiesto();
  const [verificando, setVerificando] = useState(true);

  // Estados para Subir normal
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  // Estados para Comparar
  const [archivoGeneral, setArchivoGeneral] = useState<File | null>(null);
  const [archivoVentas, setArchivoVentas] = useState<File | null>(null);
  const [comparando, setComparando] = useState(false);
  const [errorComparar, setErrorComparar] = useState<string | null>(null);

  // Estados para el Modal de Notificación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalContenido, setModalContenido] = useState({ titulo: "", mensaje: "", tipo: "exito" });

  // Guardián de seguridad
  useEffect(() => {
    // 1. Buscamos el token
    const token = localStorage.getItem("token");

    // 2. Si no hay token (o es el falso de prueba), redirigimos AL INSTANTE
    if (!token || token === "token_falso_de_prueba") {
      router.replace("/login");
    } else {
      // 3. Si hay token, quitamos el estado de carga
      setVerificando(false);
    }
  }, [router]);

  // 4. Mientras verifica, mostramos una pantalla en blanco o un spinner
  if (verificando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  const handleSubir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo) return;

    setSubiendo(true);
    setError(null);

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
    setErrorComparar(null);

    try {
      const formData = new FormData();
      formData.append("file_general", archivoGeneral);
      formData.append("file_ventas", archivoVentas);

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || "https://manifiesto-backend.onrender.com/api";
      const res = await fetch(`${baseUrl}/manifiestos/comparar-manifiestos`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${localStorage.getItem("token")}`
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

  if (verificando) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-3 text-slate-600">Verificando sesión...</span>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-4xl mx-auto space-y-6">

        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">📤 Subir Manifiesto</h1>
          <p className="text-slate-600">Sube tu archivo Excel para procesarlo y guardarlo en el sistema</p>
        </div>

        {/* Tarjeta de Subida Normal */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <form onSubmit={handleSubir} className="space-y-6">
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center hover:bg-slate-50 transition-colors relative cursor-pointer">
              <input
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={(e) => setArchivo(e.target.files?.[0] || null)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />

              <div className="flex items-center justify-center gap-2">
                <p className="text-slate-700 font-medium">
                  {archivo ? archivo.name : "Arrastra tu archivo aquí o haz clic para buscar"}
                </p>
                {archivo && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setArchivo(null);
                      const input = e.currentTarget.parentElement?.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
                      if (input) input.value = "";
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors z-10 relative"
                    title="Quitar archivo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-500 mt-1">Formatos soportados: .xlsx, .xls, .csv</p>
            </div>
            <button
              type="submit"
              disabled={!archivo || subiendo}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
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
              <label className="block text-sm font-medium text-slate-700 mb-2">Manifiesto General</label>
              <div className="relative">
                <input
                  type="file"
                  onChange={(e) => setArchivoGeneral(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 pr-10"
                />
                {archivoGeneral && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setArchivoGeneral(null);
                      const input = e.currentTarget.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
                      if (input) input.value = "";
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Quitar archivo general"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Manifiesto de Ventas */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Manifiesto de Ventas</label>
              <div className="relative">
                <input
                  type="file"
                  onChange={(e) => setArchivoVentas(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100 pr-10"
                />
                {archivoVentas && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setArchivoVentas(null);
                      const input = e.currentTarget.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
                      if (input) input.value = "";
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Quitar archivo de ventas"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {errorComparar && (
            <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
              {errorComparar}
            </div>
          )}

          <button
            onClick={handleComparar}
            disabled={!archivoGeneral || !archivoVentas || comparando}
            className={`w-full font-medium py-3 rounded-lg transition-all flex items-center justify-center gap-2 ${
              (!archivoGeneral || !archivoVentas) 
                ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                : "bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg"
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
    </main>
  );
}