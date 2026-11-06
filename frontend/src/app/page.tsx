"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, FileSpreadsheet, AlertCircle, Loader2, Download } from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { subirYGuardar, compararManifiestos } from "@/lib/api"; // (agrega compararManifiestos)

export default function Home() {
  const router = useRouter();
  const [fileGeneral, setFileGeneral] = useState<File | null>(null);
  const [fileVentas, setFileVentas] = useState<File | null>(null);
  const [comparando, setComparando] = useState(false);
  const { subirYGuardar, loading, error, metadata, recargarLista, seleccionarManifiesto } = useManifiesto();
  const [archivoLocal, setArchivoLocal] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const handleFile = useCallback((f: File) => {
    setArchivoLocal(f);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleFile(e.dataTransfer.files[0]);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleUpload = async () => {
  if (!archivoLocal) return;
  setAviso(null);
  try {
    const result = await subirYGuardar(archivoLocal);
    if (result.alreadyExists) {
      setAviso("ℹ️ Este manifiesto ya está cargado. Redirigiendo...");
      setTimeout(() => router.push("/provincias"), 1500);
    } else {
      router.push("/provincias");
    }
  } catch (err) {
    // Error ya manejado en el Context
  }
};

    const handleComparar = async () => {
    if (!fileGeneral || !fileVentas) {
      alert("Por favor, sube ambos archivos.");
      return;
    }
    setComparando(true);
    try {
      const result = await compararManifiestos(fileGeneral, fileVentas);
      await recargarLista();
      await seleccionarManifiesto(result.manifiesto_id);
      router.push("/provincias");
    } catch (err: any) {
      const mensaje = err.response?.data?.detail || err.message || "Error desconocido";
      alert(`Error: ${mensaje}`);
    } finally {
      setComparando(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            📦 Analizador de Manifiestos
          </h1>
          <p className="text-slate-600">Sube tu archivo Excel para comenzar</p>
        </div>

        {metadata && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <FileSpreadsheet className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Ya tienes un manifiesto cargado
                </p>
                <p className="text-xs text-blue-700 mt-0.5">
                  {metadata.nombre_archivo} · {metadata.total_filas} HBLs ·{" "}
                  {metadata.total_provincias} provincias
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push("/provincias")}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium whitespace-nowrap"
            >
              Ir a Provincias →
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors cursor-pointer ${
              dragActive
                ? "border-blue-500 bg-blue-50"
                : "border-slate-300 hover:border-slate-400"
            }`}
            onClick={() => document.getElementById("file-input")?.click()}
          >
            <input
              id="file-input"
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files && handleFile(e.target.files[0])}
            />

            {archivoLocal ? (
              <div className="flex flex-col items-center gap-3">
                <FileSpreadsheet className="w-12 h-12 text-green-600" />
                <div>
                  <p className="font-medium text-slate-900">
                    {archivoLocal.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {(archivoLocal.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setArchivoLocal(null);
                  }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Cambiar archivo
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-3">
                <Upload className="w-12 h-12 text-slate-400" />
                <div>
                  <p className="text-slate-900 font-medium">
                    Arrastra tu archivo aquí o haz clic para buscar
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Formatos soportados: .xlsx, .xls, .csv
                  </p>
                </div>
              </div>
            )}
          </div>

          {archivoLocal && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={handleUpload}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-medium px-8 py-3 rounded-lg flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Procesando y guardando...
                  </>
                ) : (
                  <>
                    <Upload className="w-5 h-5" />
                    Procesar manifiesto
                  </>
                )}
              </button>
            </div>
        )}

          {/* 👇 AVISO */}
  {aviso && (
    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
      {aviso}
    </div>
  )}
        </div>
        <>
        {/* Restar Manifiestos */}
        <div className="mt-8 bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-slate-900 mb-1">
                Restar Manifiesto (Comparar)
              </h2>
              <p className="text-sm text-slate-600">
                Sube el manifiesto general y el de ventas. Te devolveremos un Excel con los HBLs del general que NO están en el de ventas.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Manifiesto General</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFileGeneral(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Manifiesto de Ventas</label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => setFileVentas(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-green-50 file:text-green-700 hover:file:bg-green-100"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleComparar}
              disabled={!fileGeneral || !fileVentas || comparando}
              className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              {comparando ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Comparando...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Comparar y Guardar
                </>
              )}
            </button>
          </div>
        </div>
        </>
      </div>
    </main>
  );
}
// deploy