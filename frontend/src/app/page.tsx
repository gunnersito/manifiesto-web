"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Loader2, Upload } from "lucide-react";
import { subirManifiesto } from "@/lib/api";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { Modal } from "@/components/ui/modal";
import { LoadingModal } from "@/components/ui/loading-modal";
import { ZonaArchivo } from "@/components/ZonaArchivo";
import Cookies from "js-cookie";

export default function Home() {
  const router = useRouter();
  const { recargarLista } = useManifiesto();

  // Estados para Subir normal
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  // Estados para el Modal de Notificación
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalContenido, setModalContenido] = useState({ titulo: "", mensaje: "", tipo: "exito" });

  // 👇 EL GUARDIÁN DEFINITIVO 👇
  useEffect(() => {
    const sesion = Cookies.get("sesion");
    if (!sesion) {
      router.replace("/login");
    }
  }, [router]);

  // Si no hay token, no renderizamos NADA (evita el parpadeo y la entrada directa)
  if (!Cookies.get("sesion")) {
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

        <p className="text-center text-sm text-slate-500">
          Para restar un manifiesto de ventas al general, usa el comparador del{" "}
          <Link href="/dashboard" className="font-medium text-primary hover:underline">
            Dashboard
          </Link>.
        </p>
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
        isOpen={subiendo}
        text="Subiendo y procesando el manifiesto..."
      />
    </main>
  );
}
