"use client";

import { useState, useRef, useEffect } from "react";
import { MapPin, Search, Building2, Home, Check } from "lucide-react";

interface Props {
  values: string[]; // 👈 Ahora es un arreglo
  onChange: (values: string[]) => void;
  opciones: string[];
  provincias?: string[];
  placeholder?: string;
}

export default function AutocompleteUbicacion({
  values = [],
  onChange,
  opciones,
  provincias = [],
  placeholder = "todas las ubicaciones",
}: Props) {
  const [abierto, setAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const contenedorRef = useRef<HTMLDivElement>(null);

  // Cerrar al hacer clic fuera
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        contenedorRef.current &&
        !contenedorRef.current.contains(e.target as Node)
      ) {
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtradas = busqueda.trim()
    ? opciones.filter((o) =>
        o.toLowerCase().includes(busqueda.toLowerCase().trim())
      )
    : opciones;

  const visibles = filtradas.slice(0, 8);

  const toggleSeleccion = (opcion: string) => {
    if (values.includes(opcion)) {
      onChange(values.filter((v) => v !== opcion));
    } else {
      onChange([...values, opcion]);
    }
  };

  // Texto que se muestra en el botón principal
  const textoMostrar =
    values.length === 0
      ? placeholder
      : values.length === 1
      ? values[0]
      : `${values[0]} (+${values.length - 1} más)`;

  return (
    <div ref={contenedorRef} className="relative w-full">
      {/* Botón principal */}
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className={`w-full flex items-center justify-between px-3 h-[42px] border rounded-lg text-sm bg-white transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
          abierto ? "border-ring" : "border-slate-300 hover:border-slate-400"
        }`}
      >
        <div className="flex items-center gap-2 text-slate-500 overflow-hidden">
          <MapPin className="w-4 h-4 flex-shrink-0" />
          <span className={`truncate ${values.length > 0 ? "text-slate-900 font-medium" : ""}`}>
            {textoMostrar}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform ${abierto ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Menú desplegable */}
      {abierto && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">

          {/* Caja de búsqueda interna */}
          <div className="p-3 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                autoFocus
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar ubicación..."
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all"
              />
            </div>
          </div>

          {/* Lista de opciones */}
          <div className="max-h-60 overflow-y-auto p-2 space-y-1">
            {visibles.length > 0 ? (
              visibles.map((opcion, index) => {
                const esProvincia = provincias.includes(opcion);
                const isSelected = values.includes(opcion);

                return (
                  <button
                    key={`${opcion}-${index}`}
                    type="button"
                    onClick={() => toggleSeleccion(opcion)}
                    className={`w-full text-left p-2 rounded-lg flex items-center gap-3 transition-colors ${
                      isSelected ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    {/* Checkbox visual */}
                    <div
                      className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                        isSelected
                          ? "bg-blue-600 border-blue-600"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>

                    {/* Ícono y Texto */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {esProvincia ? (
                            <Building2 className="w-4 h-4 text-blue-600 flex-shrink-0" />
                          ) : (
                            <Home className="w-4 h-4 text-slate-400 flex-shrink-0" />
                          )}
                          <span className="text-sm font-medium text-slate-900 truncate">
                            {opcion}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 block truncate pl-6">
                        {esProvincia ? "Provincia" : "Municipio"}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                No se encontraron resultados
              </div>
            )}
          </div>

          {/* Botón de cerrar/limpiar */}
          {values.length > 0 && (
            <div className="p-2 border-t border-slate-100 bg-slate-50 text-right">
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Limpiar selección
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}