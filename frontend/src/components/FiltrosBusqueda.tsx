"use client";

import { useState } from "react";
import { ChevronDown, Loader2, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AutocompleteUbicacion from "@/components/AutocompleteUbicacion";

interface Props {
  busqueda: string;
  onBusqueda: (valor: string) => void;
  estado: string;
  onEstado: (valor: string) => void;
  ubicacion: string;
  onUbicacion: (valor: string) => void;
  opcionesUbicacion: string[];
  provincias: string[];
  placeholderFiltro: string;
  placeholderUbicacion: string;
  onBuscar: () => void;
  onLimpiar: () => void;
  cargando: boolean;
}

const ESTADOS = ["Pendiente", "Despachada", "Devuelto Almacén", "Entregada"];

export default function FiltrosBusqueda({
  busqueda,
  onBusqueda,
  estado,
  onEstado,
  ubicacion,
  onUbicacion,
  opcionesUbicacion,
  provincias,
  placeholderFiltro,
  placeholderUbicacion,
  onBuscar,
  onLimpiar,
  cargando,
}: Props) {
  const [abierto, setAbierto] = useState(true);

  const chips = [
    busqueda && { key: "filtro", label: "Filtro", valor: busqueda, onQuitar: () => onBusqueda("") },
    ubicacion && { key: "ubicacion", label: "Ubicación", valor: ubicacion, onQuitar: () => onUbicacion("") },
    estado && { key: "estado", label: "Estado", valor: estado, onQuitar: () => onEstado("") },
  ].filter(Boolean) as { key: string; label: string; valor: string; onQuitar: () => void }[];

  return (
    <section className="bg-white rounded-2xl shadow-sm border border-slate-200">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls="panel-filtros"
        className="w-full flex items-center justify-between gap-3 px-5 py-4 sm:px-6 text-left"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-5 h-5 text-slate-500" />
          <h3 className="font-semibold text-slate-900">Filtros de búsqueda</h3>
          {chips.length > 0 && (
            <span className="bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
              {chips.length} {chips.length === 1 ? "activo" : "activos"}
            </span>
          )}
        </div>
        <ChevronDown
          className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`}
        />
      </button>

      {abierto && (
        <div id="panel-filtros" className="px-5 sm:px-6 pb-5 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
            <div className="w-full min-w-0 space-y-1.5 lg:w-80">
              <Label htmlFor="filtro-texto" className="text-xs font-medium text-slate-600">
                Filtro
              </Label>
              <Input
                id="filtro-texto"
                placeholder={placeholderFiltro}
                value={busqueda}
                onChange={(e) => onBusqueda(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    onBuscar();
                  }
                }}
                className="!h-[42px] bg-white"
              />
            </div>

            <div className="w-full min-w-0 space-y-1.5 lg:w-64">
              <Label className="text-xs font-medium text-slate-600">Ubicación</Label>
              <AutocompleteUbicacion
                values={ubicacion ? [ubicacion] : []}
                onChange={(vals) => onUbicacion(vals[0] || "")}
                provincias={provincias}
                opciones={opcionesUbicacion}
                placeholder={placeholderUbicacion}
              />
            </div>

            <div className="w-full min-w-0 space-y-1.5 lg:w-44">
              <Label className="text-xs font-medium text-slate-600">Estado</Label>
              <Select
                value={estado || "todos"}
                onValueChange={(v) => onEstado(!v || v === "todos" ? "" : v)}
              >
                <SelectTrigger className="w-full !h-[42px] bg-white">
                  <SelectValue placeholder="todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">todos</SelectItem>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2 lg:ml-auto">
              <Button variant="outline" onClick={onLimpiar} disabled={cargando}>
                Limpiar
              </Button>
              <Button onClick={onBuscar} disabled={cargando}>
                {cargando ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                  </>
                ) : (
                  "Buscar"
                )}
              </Button>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <span
                  key={c.key}
                  className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-sm font-medium pl-3 pr-1.5 py-1 rounded-full max-w-full"
                >
                  <span className="text-primary/70">{c.label}:</span>
                  <span className="truncate">{c.valor}</span>
                  <button
                    type="button"
                    onClick={c.onQuitar}
                    aria-label={`Quitar filtro ${c.label}`}
                    className="p-0.5 rounded-full hover:bg-primary/20 transition-colors flex-shrink-0"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}

        </div>
      )}
    </section>
  );
}
