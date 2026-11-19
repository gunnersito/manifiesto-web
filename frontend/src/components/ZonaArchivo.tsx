"use client";

import { useState } from "react";
import { FileSpreadsheet, Upload, X } from "lucide-react";

// ============================================================
// COMPONENTE: zona para elegir o arrastrar un archivo
// ============================================================
export function ZonaArchivo({
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
