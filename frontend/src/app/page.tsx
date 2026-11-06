"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { subirManifiesto } from "@/lib/api";
import { useManifiesto } from "@/contexts/ManifiestoContext";

export default function Home() {
  const router = useRouter();
  const { recargarLista } = useManifiesto();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const handleSubir = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!archivo) return;

    setSubiendo(true);
    setError(null);
    setExito(false);

    try {
      // Llamamos a la API para procesar y guardar el Excel
      await subirManifiesto(archivo);
      setExito(true);

      if (recargarLista) recargarLista();

      // Redirigimos a los manifiestos después de un segundo
      setTimeout(() => {
        router.push("/manifiestos");
      }, 1500);

    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Error al subir el manifiesto");
    } finally {
      setSubiendo(false);
    }
  };

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
              <p className="text-slate-700 font-medium mb-1">
                {archivo ? archivo.name : "Arrastra tu archivo aquí o haz clic para buscar"}
              </p>
              <p className="text-sm text-slate-500">Formatos soportados: .xlsx, .xls, .csv</p>
            </div>

            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            )}

            {exito && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-green-700">¡Manifiesto subido y guardado con éxito! Redirigiendo...</div>
              </div>
            )}

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
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Manifiesto General</label>
              <input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Manifiesto de Ventas</label>
              <input type="file" className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100" />
            </div>
          </div>

          <button className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2">
            <Upload className="w-5 h-5" /> Comparar y Guardar
          </button>
        </div>

      </div>
    </main>
  );
}