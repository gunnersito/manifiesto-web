"use client";
import AutocompleteUbicacion from "@/components/AutocompleteUbicacion";
import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Upload,
  Search,
  MapPin,
  User,
  UserCheck,
  FileText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { obtenerTodosLosHBLs, actualizarEstado, type HBLRegistro, type HBLsPaginaResponse,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ESTADOS = ["Pendiente", "Despachada", "Devuelto Almacén", "Entregada"];

export default function RegistrosPage() {
  const { metadata, manifiestos } = useManifiesto();
  const [pagina, setPagina] = useState(1);
  const [porPagina, setPorPagina] = useState(15);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [provinciaFiltro, setProvinciaFiltro] = useState<string[]>([]);
  const [manifiestoFiltro, setManifiestoFiltro] = useState<string>("");
  const [datos, setDatos] = useState<HBLsPaginaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

    // Cargar datos
  const cargarDatos = async (nuevaPagina = pagina) => {
    setLoading(true);
    setError(null);
    try {
      const idParaFiltrar = manifiestoFiltro ? Number(manifiestoFiltro) : null;

      const result = await obtenerTodosLosHBLs(
        idParaFiltrar,
        nuevaPagina,
        porPagina,
        busqueda,
        estadoFiltro,
        provinciaFiltro.join(",")
      );
      setDatos(result);
      setPagina(nuevaPagina);
    } catch (err: any) {
      setError(err.message || "Error al cargar los registros");
    } finally {
      setLoading(false);
    }
  };

  // Cargar al montar
  useEffect(() => {
    cargarDatos(1);
  }, [manifiestoFiltro]); // 👈 Ahora escucha al filtro de manifiesto

  const aplicarFiltros = () => cargarDatos(1);

  const limpiarFiltros = () => {
    setBusqueda("");
    setEstadoFiltro("");
    setProvinciaFiltro("");
    if (manifiestoId) {
      obtenerHBLsManifiesto(manifiestoId, 1, porPagina, busqueda, estadoFiltro, provinciaFiltro.join(","))
        .then((r) => {
          setDatos(r);
          setPagina(1);
        });
    }
  };

  const cambiarPagina = (nueva: number) => {
    if (nueva < 1 || (datos && nueva > datos.total_paginas)) return;
    cargarDatos(nueva);
  };

  const cambiarPorPagina = (nuevo: number) => {
    setPorPagina(nuevo);
    if (manifiestoId) {
      obtenerHBLsManifiesto(manifiestoId, 1, porPagina, busqueda, estadoFiltro, provinciaFiltro.join(","))
        .then((r) => {
          setDatos(r);
          setPagina(1);
        });
    }
  };

  // Sin datos
  if (!metadata) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="text-6xl mb-4">📋</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              No hay manifiesto cargado
            </h1>
            <p className="text-slate-600 mb-6">
              Sube un manifiesto Excel para ver los registros.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              Ir a Subir
            </Link>
          </div>
        </div>
      </main>
    );
  }

    // Orden geográfico de provincias (Occidente a Oriente)
  const ORDEN_PROVINCIAS = [
    "PINAR DEL RIO", "ARTEMISA", "LA HABANA", "MAYABEQUE", "MATANZAS",
    "CIENFUEGOS", "VILLA CLARA", "SANCTI SPIRITUS", "CIEGO DE AVILA",
    "CAMAGUEY", "LAS TUNAS", "HOLGUIN", "GRANMA", "SANTIAGO DE CUBA",
    "GUANTANAMO", "ISLA DE LA JUVENTUD"
  ];

  // 1. Unir provincias y municipios en un solo arreglo
  const opcionesUbicacion = new Set<string>();

  if (metadata?.resumen) {
    // 2. Ordenar las provincias según nuestra lista
    const provinciasOrdenadas = [...metadata.resumen].sort((a, b) => {
      const indexA = ORDEN_PROVINCIAS.indexOf(a.provincia.toUpperCase());
      const indexB = ORDEN_PROVINCIAS.indexOf(b.provincia.toUpperCase());
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });

    // 3. Agregar provincias y luego sus municipios
    provinciasOrdenadas.forEach((p) => {
      opcionesUbicacion.add(p.provincia);
      if (p.municipios) {
        p.municipios.forEach((m) => opcionesUbicacion.add(m));
      }
    });
  }

  const ubicacionesFinales = Array.from(opcionesUbicacion);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📋 Registros</h1>
          <p className="text-slate-600 text-sm mt-1">
            {metadata.nombre_archivo} · {metadata.total_filas} HBLs
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Filtros */}
        <details className="group bg-white rounded-lg border border-slate-200">
          <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-3 select-none flex-wrap">
            <div className="flex items-center gap-2">
              <ChevronRight className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-90" />
              <span className="font-semibold text-slate-900">
                Filtros de Búsqueda
              </span>
              {(busqueda || estadoFiltro || provinciaFiltro) && (
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
                  activos
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={aplicarFiltros} disabled={loading}>
                <Search className="w-4 h-4 mr-1" />
                Buscar
              </Button>
              <Button variant="outline" onClick={limpiarFiltros} disabled={loading}>
                Limpiar
              </Button>
            </div>
          </summary>

                    <div className="p-4 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">

              {/* 1. Filtro de Manifiesto */}
              <div className="w-full min-w-0">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Manifiesto
                </label>
                <select
                  value={manifiestoFiltro}
                  onChange={(e) => setManifiestoFiltro(e.target.value)}
                  className="w-full px-3 h-[42px] border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Todos los manifiestos</option>
                  {manifiestos.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre_archivo}
                    </option>
                  ))}
                </select>
              </div>

              {/* 1. Filtro de Búsqueda */}
              <div className="w-full min-w-0">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Filtro
                </label>
                <Input
                  placeholder="HBL, remitente, destinatario..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") aplicarFiltros();
                  }}
                  className="h-[42px] bg-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              {/* 2. Filtro Provincia / Municipio */}
              <div className="w-full min-w-0">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Provincia / Municipio
                </label>
                <AutocompleteUbicacion
                  values={provinciaFiltro}
                  onChange={setProvinciaFiltro}
                  opciones={ubicacionesFinales}
                  provincias={metadata?.resumen.map((p) => p.provincia) || []}
                  placeholder="todas las ubicaciones"
                />
              </div>

              {/* 3. Filtro Estado */}
              <div className="w-full min-w-0">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Estado
                </label>
                <Select
                  value={estadoFiltro || "todos"}
                  onValueChange={(value) =>
                    setEstadoFiltro(value === "todos" ? "" : value)
                  }
                >
                  <SelectTrigger className="w-full !h-[42px] bg-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                  <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos</SelectItem>
                    {ESTADOS.map((e) => (
                      <SelectItem key={e} value={e}>
                        {e}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </details>

        {/* Tabla */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" />
              <p className="text-sm text-slate-600">Cargando registros...</p>
            </div>
          ) : !datos || datos.hbls.length === 0 ? (
            <div className="p-12 text-center text-slate-500">
              No hay registros que coincidan con los filtros.
            </div>
          ) : (
            <>
              {/* Cabecera de la tabla */}
              <div className="hidden md:grid md:grid-cols-[1.5fr_1.2fr_1.5fr_1.8fr_1.2fr_1fr] gap-4 px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase whitespace-nowrap">
  <div>#HBL</div>
  <div>Remitente</div>
  <div>Destinatario</div>
  <div>Dirección</div>
  <div>Contenido</div>
  <div className="text-right">Estado</div>
</div>

              {/* Filas */}
              <div className="divide-y divide-slate-100">
                {datos.hbls.map((h) => (
                  <FilaRegistro key={h.id} hbl={h} />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Paginación */}
        {datos && datos.total > 0 && (
          <div className="bg-white rounded-lg border border-slate-200 p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-600">Mostrar</span>
                <select
                  value={porPagina}
                  onChange={(e) => cambiarPorPagina(Number(e.target.value))}
                  className="px-2 py-1 border border-slate-300 rounded text-sm bg-white"
                >
                  <option value={15}>15</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
                <span className="text-sm text-slate-600">por página</span>
              </div>
              <span className="text-sm text-slate-600">
                {(pagina - 1) * porPagina + 1}-
                {Math.min(pagina * porPagina, datos.total)} de {datos.total}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => cambiarPagina(pagina - 1)}
                disabled={pagina <= 1}
                className="p-2 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-slate-600">
                Página {pagina} de {datos.total_paginas}
              </span>
              <button
                onClick={() => cambiarPagina(pagina + 1)}
                disabled={pagina >= datos.total_paginas}
                className="p-2 rounded hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

// ============================================================
// Fila de registro
// ============================================================
function FilaRegistro({ hbl }: { hbl: HBLRegistro }) {
  const [estado, setEstado] = useState(hbl.estado);
  const [guardando, setGuardando] = useState(false);

  const colores: Record<string, string> = {
    Pendiente: "bg-slate-100 text-slate-700 border-slate-200",
    Despachada: "bg-blue-100 text-blue-700 border-blue-200",
    "Devuelto Almacén": "bg-red-100 text-red-700 border-red-200",
    Entregada: "bg-green-100 text-green-700 border-green-200",
  };

  const cambiarEstado = async (nuevo: string) => {
    if (nuevo === estado) return;
    const anterior = estado;
    setEstado(nuevo);
    setGuardando(true);
    try {
      await actualizarEstado(hbl.hbl, nuevo);
    } catch (err) {
      console.error("Error al guardar estado:", err);
      setEstado(anterior);
    } finally {
      setGuardando(false);
    }
  };

    return (
    <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.2fr_1.5fr_1.8fr_1.2fr_1fr] gap-4 px-4 py-3 hover:bg-slate-50 transition-colors text-sm items-center border-b border-slate-100 last:border-0">

      {/* 1. HBL + bultos + peso */}
      <div className="min-w-0">
        <div className="font-mono text-xs font-semibold text-slate-900 truncate" title={hbl.hbl}>
          {hbl.hbl}
        </div>
        <div className="text-[10px] text-slate-500 mt-0.5">
          {hbl.bultos} bulto{hbl.bultos !== 1 ? "s" : ""} · {typeof hbl.peso === "number" ? hbl.peso.toFixed(1) : "—"} kg
        </div>
      </div>

      {/* 2. Remitente */}
      <div className="min-w-0 flex items-start gap-1.5">
        <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-900 truncate" title={hbl.remitente || "—"}>
          {hbl.remitente || "—"}
        </div>
      </div>

      {/* 3. Destinatario + Teléfono */}
      <div className="min-w-0 flex items-start gap-1.5">
        <UserCheck className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-xs text-slate-900 truncate" title={hbl.destinatario || "—"}>
            {hbl.destinatario || "—"}
          </div>
          {hbl.telefono && (
            <div className="text-[10px] text-slate-500 truncate" title={hbl.telefono}>
              📞 {hbl.telefono}
            </div>
          )}
        </div>
      </div>

      {/* 4. Dirección (Municipio, Provincia, Calle) */}
      <div className="min-w-0 flex items-start gap-1.5">
        <MapPin className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <div className="text-xs font-medium text-slate-900 truncate" title={hbl.municipio}>
            {hbl.municipio}
          </div>
          <div className="text-[10px] text-slate-500 truncate" title={hbl.provincia}>
            {hbl.provincia}
          </div>
          <div className="text-[10px] text-slate-500 truncate" title={hbl.direccion}>
            {hbl.direccion}
          </div>
        </div>
      </div>

      {/* 5. Contenido */}
      <div className="min-w-0 flex items-start gap-1.5">
        <FileText className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-slate-700 truncate" title={hbl.contenido || "—"}>
          {hbl.contenido || "—"}
        </div>
      </div>

      {/* 6. Estado */}
      <div className="flex md:justify-end">
        <div className="relative w-full md:w-auto">
          {guardando && (
            <Loader2 className="w-3 h-3 animate-spin text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          )}
          <select
            value={estado}
            onChange={(e) => cambiarEstado(e.target.value)}
            disabled={guardando}
            className={`w-full md:w-auto text-[10px] font-medium px-2 py-1.5 rounded-full border cursor-pointer outline-none appearance-none pr-6 text-center ${
              colores[estado] || colores.Pendiente
            } ${guardando ? "opacity-60" : ""}`}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 6px center",
            }}
          >
            {ESTADOS.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>
      </div>

    </div>
  );
}