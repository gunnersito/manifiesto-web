"use client";
import Dashboard from "@/components/Dashboard";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AutocompleteUbicacion from "@/components/AutocompleteUbicacion";
import { useState, useCallback } from "react";
import {
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  MapPin,
  Package,
} from "lucide-react";
import {
  subirManifiesto,
  obtenerParadas,
  obtenerHBLsParada,
  actualizarEstado,
  exportarProvincia,
  exportarHojaRuta,
  exportarTodasProvincias,
  exportarPorMunicipios,
  obtenerParadasFiltradas,
  obtenerResumenFiltrado,
  type UploadResponse,
  type ParadasResponse,
  type ParadaInfo,
  type HBLsParadaResponse,
  type ResumenFiltradoResponse,
} from "@/lib/api";

type Vista = "upload" | "resumen" | "provincia";

export default function Home() {
  const {
  file,
  data,
  loading,
  error,
  subirArchivo,
  limpiar: limpiarContexto,
} = useManifiesto();
console.log("🔵 Home render - file:", file?.name || "vacío", "data:", data ? "cargado" : "vacío");
  const [dragActive, setDragActive] = useState(false);
  const [vista, setVista] = useState<Vista>(data ? "resumen" : "upload");
  const [provinciaSel, setProvinciaSel] = useState<string | null>(null);
  const [paradas, setParadas] = useState<ParadasResponse | null>(null);
  const [loadingParadas, setLoadingParadas] = useState(false);
  const [tabActivo, setTabActivo] = useState<"paradas" | "dashboard">("paradas");
  const [errorLocal, setErrorLocal] = useState<string | null>(null);

  // --- Filtros ---
const [busqueda, setBusqueda] = useState("");
const [estadoFiltro, setEstadoFiltro] = useState("");
const [ubicacionFiltro, setUbicacionFiltro] = useState("");
const [cargandoFiltro, setCargandoFiltro] = useState(false);
const [totalSinFiltro, setTotalSinFiltro] = useState(0);

// --- Filtros del resumen general ---
const [resumenFiltrado, setResumenFiltrado] = useState<ResumenFiltradoResponse | null>(null);
const [busquedaResumen, setBusquedaResumen] = useState("");
const [estadoResumen, setEstadoResumen] = useState("");
const [ubicacionResumen, setUbicacionResumen] = useState("");
const [cargandoResumen, setCargandoResumen] = useState(false);
const provinciasMostradas = resumenFiltrado ? resumenFiltrado.provincias : (data?.provincias || []);
const totalHBLsMostrado = resumenFiltrado ? resumenFiltrado.total_filas : (data?.total_filas || 0);
const totalSinFiltroResumen = resumenFiltrado ? resumenFiltrado.total_filas_sin_filtro : (data?.total_filas || 0);

  const [archivoLocal, setArchivoLocal] = useState<File | null>(null);

const handleFile = useCallback((f: File) => {
  setArchivoLocal(f);
  setVista("upload");
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
  try {
    await subirArchivo(archivoLocal);
    setVista("resumen");
  } catch (err) {
    // El error ya se maneja en el Context
  }
};

  const verProvincia = async (provincia: string) => {
  if (!file) return;
  setProvinciaSel(provincia);
  setLoadingParadas(true);
  setErrorLocal(null);

  // 👇 Si hay filtros activos en el resumen, pasarlos a la provincia
  const tieneFiltroResumen = busquedaResumen || estadoResumen || ubicacionResumen;

  if (tieneFiltroResumen) {
    // Pasar los filtros del resumen a los filtros de la provincia
    setBusqueda(busquedaResumen);
    setEstadoFiltro(estadoResumen);
    setUbicacionFiltro(ubicacionResumen);
  } else {
    // Limpiar filtros de la provincia
    setBusqueda("");
    setEstadoFiltro("");
    setUbicacionFiltro("");
  }

  try {
    const result = await obtenerParadasFiltradas(
      file,
      provincia,
      tieneFiltroResumen ? busquedaResumen : "",
      tieneFiltroResumen ? estadoResumen : "",
      tieneFiltroResumen ? ubicacionResumen : ""
    );
    setParadas(result);
    setTotalSinFiltro(result.total_hbls_sin_filtro);
    setVista("provincia");
  } catch (err: any) {
    setErrorLocal(
      err.response?.data?.detail || err.message || "Error al obtener paradas"
    );
  } finally {
    setLoadingParadas(false);
  }
};

  const aplicarFiltros = async () => {
  if (!file || !provinciaSel) return;
  setCargandoFiltro(true);
  setErrorLocal(null);
  try {
    const result = await obtenerParadasFiltradas(
      file,
      provinciaSel,
      busqueda,
      estadoFiltro,
      ubicacionFiltro
    );
    setParadas(result);
    setTotalSinFiltro(result.total_hbls_sin_filtro);
  } catch (err: any) {
    setErrorLocal(
      err.response?.data?.detail || err.message || "Error al aplicar filtros"
    );
  } finally {
    setCargandoFiltro(false);
  }
};

const limpiarFiltros = async () => {
  setBusqueda("");
  setEstadoFiltro("");
  setUbicacionFiltro("");
  if (!file || !provinciaSel) return;
  setCargandoFiltro(true);
  try {
    const result = await obtenerParadasFiltradas(file, provinciaSel, "", "", "");
    setParadas(result);
    setTotalSinFiltro(result.total_hbls_sin_filtro);
  } catch (err: any) {
    setErrorLocal(err.message || "Error al limpiar filtros");
  } finally {
    setCargandoFiltro(false);
  }
};

const aplicarFiltrosResumen = async () => {
  if (!file) return;
  setCargandoResumen(true);
  setErrorLocal(null);
  try {
    const result = await obtenerResumenFiltrado(
      file,
      busquedaResumen,
      estadoResumen,
      ubicacionResumen
    );
    setResumenFiltrado(result);
  } catch (err: any) {
    setErrorLocal(
      err.response?.data?.detail || err.message || "Error al aplicar filtros"
    );
  } finally {
    setCargandoResumen(false);
  }
};

const limpiarFiltrosResumen = async () => {
  setBusquedaResumen("");
  setEstadoResumen("");
  setUbicacionResumen("");
  if (!file) return;
  setCargandoResumen(true);
  try {
    const result = await obtenerResumenFiltrado(file, "", "", "");
    setResumenFiltrado(result);
  } catch (err: any) {
    setErrorLocal(err.message || "Error al limpiar filtros");
  } finally {
    setCargandoResumen(false);
  }
};

  const volverAResumen = () => {
  setVista("resumen");
  setProvinciaSel(null);
  setParadas(null);
  // No borrar los filtros del resumen para que el usuario los conserve
};

  const reset = () => {
  setArchivoLocal(null);
  limpiarContexto();
  setParadas(null);
  setProvinciaSel(null);
  setVista("upload");
};

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-10 text-center">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            📦 Analizador de Manifiestos
          </h1>
          <p className="text-slate-600">
            Sube tu archivo Excel y obtén las paradas por provincia
          </p>
        </div>

        {(error || errorLocal) && (
  <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
    <div className="text-sm text-red-700">{error || errorLocal}</div>
  </div>
)}

        {/* VISTA 1: UPLOAD */}
        {vista === "upload" && (
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
                    <p className="font-medium text-slate-900">{archivoLocal.name}</p>
                    <p className="text-sm text-slate-500">
                      {(archivoLocal.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      reset();
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
                      Procesando...
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
          </div>
        )}

        {/* VISTA 2: RESUMEN */}
        {vista === "resumen" && data && (
          <div className="space-y-6">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
  {/* Fila 1: Título + botón Exportar todas */}
  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
    <div className="flex items-center gap-3">
      <CheckCircle className="w-6 h-6 text-green-600" />
      <h2 className="text-xl font-semibold text-slate-900">
        Archivo procesado: {data.filename}
      </h2>
    </div>

    <button
  onClick={async () => {
    if (!file) return;
    try {
      await exportarTodasProvincias(file);
    } catch (err) {
      console.error("Error al exportar todas:", err);
      alert("Error al exportar todas las provincias");
    }
  }}
  style={{
    backgroundColor: "#1e293b",
    color: "white",
    padding: "8px 16px",
    borderRadius: "8px",
    fontSize: "14px",
    fontWeight: 500,
    cursor: "pointer",
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    whiteSpace: "nowrap",
    flexShrink: 0,
  }}
>
  <span>📥</span>
  <span>Exportar todas</span>
</button>
  </div>

  {/* Fila 2: Métricas */}
  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
    <Metric label="Total HBLs" value={totalHBLsMostrado} />
    <Metric label="Filas eliminadas" value={data.filas_eliminadas} />
    <Metric label="Provincias" value={provinciasMostradas.length} />
    <Metric
  label="Paradas totales"
  value={provinciasMostradas.reduce((s, p) => s + p.paradas, 0)}
    />
  </div>
</div>
            {/* Panel de filtros global */}
    <details className="group bg-white rounded-lg border border-slate-200">
      <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-3 select-none flex-wrap">
        <div className="flex items-center gap-2">
          <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
          <span className="font-semibold text-slate-900">Filtros de Búsqueda</span>
          {(busquedaResumen || estadoResumen || ubicacionResumen) && (
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
              activos
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={(e) => {
              e.preventDefault();
              aplicarFiltrosResumen();
            }}
            disabled={cargandoResumen}
          >
            {cargandoResumen ? "Buscando..." : "Buscar"}
          </Button>
          <Button
            variant="outline"
            onClick={(e) => {
              e.preventDefault();
              limpiarFiltrosResumen();
            }}
            disabled={cargandoResumen}
          >
            Limpiar
          </Button>
        </div>
      </summary>

      <div className="p-4 border-t border-slate-200">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Filtro */}
          <div className="space-y-2">
            <Label htmlFor="filtro-busqueda-resumen">Filtro</Label>
            <Input
  id="filtro-busqueda-resumen"
  placeholder="orden, cliente, descripción"
  value={busquedaResumen}
  onChange={(e) => setBusquedaResumen(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      aplicarFiltrosResumen();
    }
  }}
/>
          </div>

          {/* Ubicación */}
          <div className="space-y-2">
            <Label>Ubicación</Label>
            <AutocompleteUbicacion
              value={ubicacionResumen}
              onChange={setUbicacionResumen}
              opciones={[
                ...Array.from(new Set(provinciasMostradas.map((p) => p.provincia))).sort(),
              ]}
              placeholder="todas las ubicaciones"
            />
          </div>

          {/* Estado */}
          <div className="space-y-2">
            <Label>Estado</Label>
            <Select
              value={estadoResumen || "todos"}
              onValueChange={(value) =>
                setEstadoResumen(value === "todos" ? "" : value)
              }
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="todos los estados" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">todos los estados</SelectItem>
                <SelectItem value="Pendiente">Pendiente</SelectItem>
                <SelectItem value="Despachada">Despachada</SelectItem>
                <SelectItem value="Devuelto Almacén">Devuelto Almacén</SelectItem>
                <SelectItem value="Entregada">Entregada</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Contador */}
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span>
            Mostrando <b className="text-slate-700">{totalHBLsMostrado}</b> de{" "}
            <b className="text-slate-700">{totalSinFiltroResumen}</b> HBLs
          </span>
        </div>
      </div>
    </details>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                Resumen por provincia
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                Haz clic en una provincia para ver sus paradas
              </p>

              {loadingParadas && (
                <div className="mb-4 flex items-center gap-2 text-blue-600">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm">Cargando paradas...</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {provinciasMostradas.map((p) => (
                  <button
                    key={p.provincia}
                    onClick={() => verProvincia(p.provincia)}
                    disabled={loadingParadas}
                    className="border border-slate-200 rounded-lg p-4 text-left hover:border-blue-400 hover:shadow-md hover:bg-blue-50/30 transition-all disabled:opacity-50 group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium text-slate-900">
                        {p.provincia}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                    <div className="flex gap-4 text-sm">
                      <span className="text-slate-600">
                        <b>{p.hbls}</b> HBLs
                      </span>
                      <span className="text-blue-600">
                        <b>{p.paradas}</b> paradas
                      </span>
                      <span className="text-slate-600">
                        <b>{p.bultos}</b> bultos
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="text-center">
              <button
                onClick={reset}
                className="text-blue-600 hover:underline text-sm"
              >
                ← Subir otro archivo
              </button>
            </div>
          </div>
        )}

        {/* VISTA 3: DETALLE DE PROVINCIA */}
        {vista === "provincia" && paradas && file && (
          <div className="space-y-6">
            <button
              onClick={volverAResumen}
              className="flex items-center gap-2 text-slate-600 hover:text-blue-600 text-sm transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Volver al resumen
            </button>

            {/* Encabezado de la provincia */}
<div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
  {/* Fila 1: Título + menú de descarga */}
  <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
    <div className="flex items-center gap-3">
      <MapPin className="w-6 h-6 text-blue-600" />
    <h2 className="text-2xl font-bold text-slate-900">
      {paradas.provincia}
    </h2>
  </div>


{/* Menú desplegable de descargas */}
    <details className="group relative">
      <summary className="list-none cursor-pointer inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors select-none">
        <span>📥</span>
        <span>Descargar</span>
        <svg
          className="w-4 h-4 transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </summary>

      <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
        <button
          onClick={async () => {
            if (!file) return;
            try {
              await exportarProvincia(file, paradas.provincia);
            } catch (err) {
              console.error("Error al exportar:", err);
              alert("Error al exportar el manifiesto");
            }
          }}
          className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3"
        >
          <span>📥</span>
          <span>Exportar manifiesto</span>
        </button>

        <button
          onClick={async () => {
            if (!file) return;
            try {
              await exportarHojaRuta(file, paradas.provincia);
            } catch (err) {
              console.error("Error al exportar ruta:", err);
              alert("Error al exportar la hoja de ruta");
            }
          }}
          className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3"
        >
          <span>🚚</span>
          <span>Hoja de ruta</span>
        </button>
        {/* Después del botón "Hoja de ruta" */}
<button
  onClick={async () => {
    if (!file) return;
    try {
      await exportarPorMunicipios(file, paradas.provincia);
    } catch (err) {
      console.error("Error al exportar por municipios:", err);
      alert("Error al exportar por municipios");
    }
  }}
  className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-3"
>
  <span>📍</span>
  <span>Exportar por municipios</span>
</button>
      </div>
    </details>
  </div>

  {/* Fila 2: Métricas */}
  <div className="grid grid-cols-3 gap-4">
    <Metric label="HBLs" value={paradas.total_hbls} />
    <Metric label="Paradas" value={paradas.total_paradas} />
    <Metric
      label="Bultos"
      value={paradas.paradas.reduce((s, p) => s + p.Bultos, 0)}
    />
    </div>
</div>

            {/* Panel de filtros de provincia */}
<details className="group bg-white rounded-lg border border-slate-200">
  <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-3 select-none flex-wrap">
    <div className="flex items-center gap-2">
      <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
      <span className="font-semibold text-slate-900">Filtros de Búsqueda</span>
      {(busqueda || estadoFiltro || ubicacionFiltro) && (
        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">
          activos
        </span>
      )}
    </div>

    <div className="flex gap-2">
      <Button
        onClick={(e) => {
          e.preventDefault();
          aplicarFiltros();
        }}
        disabled={cargandoFiltro}
      >
        {cargandoFiltro ? "Buscando..." : "Buscar"}
      </Button>
      <Button
        variant="outline"
        onClick={(e) => {
          e.preventDefault();
          limpiarFiltros();
        }}
        disabled={cargandoFiltro}
      >
        Limpiar
      </Button>
    </div>
  </summary>

  <div className="p-4 border-t border-slate-200">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Filtro */}
      <div className="space-y-2">
        <Label htmlFor="filtro-busqueda-provincia">Filtro</Label>
        <Input
  id="filtro-busqueda-provincia"
  placeholder="orden, cliente, descripción"
  value={busqueda}
  onChange={(e) => setBusqueda(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      aplicarFiltros();
    }
  }}
/>
      </div>

      {/* Ubicación */}
      <div className="space-y-2">
        <Label>Ubicación</Label>
        <AutocompleteUbicacion
          value={ubicacionFiltro}
          onChange={setUbicacionFiltro}
          opciones={[
            paradas.provincia,
            ...Array.from(new Set(paradas.paradas.map((p) => p.Municipio))).sort(),
          ]}
          placeholder="todas las ubicaciones"
        />
      </div>

      {/* Estado */}
      <div className="space-y-2">
        <Label>Estado</Label>
        <Select
          value={estadoFiltro || "todos"}
          onValueChange={(value) =>
            setEstadoFiltro(value === "todos" ? "" : value)
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">todos los estados</SelectItem>
            <SelectItem value="Pendiente">Pendiente</SelectItem>
            <SelectItem value="Despachada">Despachada</SelectItem>
            <SelectItem value="Devuelto Almacén">Devuelto Almacén</SelectItem>
            <SelectItem value="Entregada">Entregada</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    {/* Contador */}
    <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
      <span>
        Mostrando <b className="text-slate-700">{paradas.total_hbls}</b> de{" "}
        <b className="text-slate-700">{totalSinFiltro}</b> HBLs
      </span>
    </div>
  </div>
</details>

            {/* Selector de tabs */}
<div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
  <button
    onClick={() => setTabActivo("paradas")}
    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      tabActivo === "paradas"
        ? "bg-white text-slate-900 shadow-sm"
        : "text-slate-600 hover:text-slate-900"
    }`}
  >
    📋 Paradas
  </button>
  <button
    onClick={() => setTabActivo("dashboard")}
    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
      tabActivo === "dashboard"
        ? "bg-white text-slate-900 shadow-sm"
        : "text-slate-600 hover:text-slate-900"
    }`}
  >
    📊 Dashboard
  </button>
</div>

{/* Contenido según tab */}
{tabActivo === "paradas" ? (
  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
    <h3 className="text-lg font-semibold text-slate-900 mb-4">
      Paradas ({paradas.total_paradas})
    </h3>

    <div className="space-y-2">
      {paradas.paradas.map((p) => (
        <ParadaCard
          key={`${p.Municipio}-${p["Dirección"]}-${p.Parada}`}
          parada={p}
          file={file}
          provincia={paradas.provincia}
        />
      ))}
    </div>
  </div>
                        ) : (
              <Dashboard paradas={paradas} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600 mt-1">{label}</div>
    </div>
  );
}
// ============================================================
// COMPONENTE: Tarjeta de Parada (expandible)
// ============================================================
function ParadaCard({
  parada,
  file,
  provincia,
}: {
  parada: ParadaInfo;
  file: File;
  provincia: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [hbls, setHbls] = useState<HBLsParadaResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleExpand = async () => {
    if (expanded) {
      setExpanded(false);
      return;
    }

    setExpanded(true);

    // Si ya cargamos, no volver a pedir
    if (hbls) return;

    setLoading(true);
    try {
      const result = await obtenerHBLsParada(
        file,
        provincia,
        parada.Municipio,
        parada["Dirección"]
      );
      setHbls(result);
    } catch (err) {
      console.error("Error al cargar HBLs:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden transition-colors hover:border-blue-300">
      {/* Cabecera clicable */}
      <button
        onClick={toggleExpand}
        className="w-full text-left p-4 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex-shrink-0">
                {parada.Parada}
              </span>
              <span className="font-medium text-slate-900 truncate">
                {parada.Destinatario || "—"}
              </span>
              <ChevronDown
                className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${
                  expanded ? "rotate-180" : ""
                }`}
              />
            </div>
            <p className="text-sm text-slate-600 truncate">
              {parada["Dirección"]}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {parada.Municipio}
            </p>
          </div>

          <div className="flex gap-3 text-sm flex-shrink-0">
            <div className="text-center">
              <div className="font-bold text-slate-900">
                {parada["Cant HBLs"]}
              </div>
              <div className="text-xs text-slate-500">HBLs</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-slate-900">{parada.Bultos}</div>
              <div className="text-xs text-slate-500">Bultos</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-slate-900">
                {parada["Peso (Kg)"].toFixed(1)}
              </div>
              <div className="text-xs text-slate-500">Kg</div>
            </div>
          </div>
        </div>
      </button>

      {/* Detalle expandido */}
      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          {loading && (
            <div className="flex items-center gap-2 text-blue-600 text-sm">
              <Loader2 className="w-4 h-4 animate-spin" />
              Cargando HBLs...
            </div>
          )}

          {!loading && hbls && (
            <div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-semibold text-slate-700">HBL</th>
                    <th className="pb-2 font-semibold text-slate-700">
                      Contenido
                    </th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">
                      Bultos
                    </th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">
                      Kg
                    </th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">
                      Estado
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {hbls.hbls.map((h) => (
                    <tr
                      key={h["HBL Número"]}
                      className="border-b border-slate-100 last:border-0"
                    >
                      <td className="py-2 font-mono text-xs text-slate-800">
                        {h["HBL Número"]}
                      </td>
                      <td className="py-2 text-slate-700">
                        {h["Contenido del paquete (Descripción)"] || "—"}
                      </td>
                      <td className="py-2 text-right text-slate-700">
                        {h["Bultos (Cant.)"]}
                      </td>
                      <td className="py-2 text-right text-slate-700">
                        {typeof h["Peso (Kg)"] === "number"
                          ? h["Peso (Kg)"]?.toFixed(2)
                          : "—"}
                      </td>
                      <td className="py-2 text-right">
  <EstadoBadge
    estado={h.Estado}
    hbl={h["HBL Número"]}
    onChange={(nuevo) => {
      // Actualizar el estado local para que se refleje
      setHbls((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          hbls: prev.hbls.map((item) =>
            item["HBL Número"] === h["HBL Número"]
              ? { ...item, Estado: nuevo }
              : item
          ),
        };
      });
    }}
  />
</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && !hbls && (
            <p className="text-sm text-slate-500">
              No se pudieron cargar los HBLs.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPONENTE: Selector de Estado (con select nativo)
// ============================================================
function EstadoBadge({
  estado,
  hbl,
  onChange,
}: {
  estado?: string;
  hbl: string;
  onChange?: (nuevoEstado: string) => void;
}) {
  const [valorActual, setValorActual] = useState(estado || "Pendiente");
  const [guardando, setGuardando] = useState(false);

  const estados = ["Pendiente", "Despachada", "Devuelto Almacén", "Entregada"];

  // Colores de fondo según el estado
  const colores: Record<string, string> = {
    Pendiente: "bg-slate-100 text-slate-700 border-slate-200",
    Despachada: "bg-blue-100 text-blue-700 border-blue-200",
    "Devuelto Almacén": "bg-red-100 text-red-700 border-red-200",
    Entregada: "bg-green-100 text-green-700 border-green-200",
  };

  const color = colores[valorActual] || colores.Pendiente;

  const cambiarEstado = async (nuevoEstado: string) => {
    if (nuevoEstado === valorActual) return;

    const anterior = valorActual;
    setValorActual(nuevoEstado);
    setGuardando(true);

    try {
      await actualizarEstado(hbl, nuevoEstado);
      onChange?.(nuevoEstado);
    } catch (err) {
      console.error("Error al guardar estado:", err);
      setValorActual(anterior);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1">
      {guardando && (
        <Loader2 className="w-3 h-3 animate-spin text-slate-400" />
      )}
      <select
        value={valorActual}
        onChange={(e) => cambiarEstado(e.target.value)}
        disabled={guardando}
        className={`text-xs font-medium px-2 py-1 rounded-full border cursor-pointer outline-none appearance-none pr-6 ${color} ${
          guardando ? "opacity-60" : ""
        }`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "right 6px center",
        }}
      >
        {estados.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>
    </div>
  );
}