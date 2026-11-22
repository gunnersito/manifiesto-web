"use client";

import { Suspense, useState, useEffect, useEffectEvent, useRef } from "react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { buscarParadasPorMunicipio } from "@/lib/api";
import FiltrosBusqueda from "@/components/FiltrosBusqueda";
import { Modal } from "@/components/ui/modal";
import { toast } from "sonner";
import {
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Upload,
  Download,
  LayoutDashboard,
  List,
  MapPin,
  Loader2,
  Truck,
} from "lucide-react";
import {
  exportarTodasProvinciasPorId,
  obtenerTodosLosHBLsFiltrados,
  obtenerProvinciaPorId,
  actualizarEstado,
  actualizarEstadosMasivos,
  exportarProvinciaPorId,
  exportarHojaRutaPorId,
  exportarPorMunicipiosPorId,
  type ManifiestoResumen,
  type ParadasResponse,
  type ParadaInfo,
  type HBLRegistro,
} from "@/lib/api";
import Dashboard from "@/components/Dashboard";
import { ORDEN_PROVINCIAS } from "@/lib/provincias";

// Agrupa los HBLs que devuelve una búsqueda para que cada provincia muestre sus
// totales reales: "parada" es 1 en el primer HBL de cada parada, igual que en el resumen
function agruparHBLsPorProvincia(hbls: HBLRegistro[]): ManifiestoResumen[] {
  const grupos = new Map<string, { hbls: number; paradas: number; bultos: number; municipios: Set<string> }>();

  for (const h of hbls) {
    const provincia = h.provincia || "Sin provincia";
    const grupo = grupos.get(provincia) ?? { hbls: 0, paradas: 0, bultos: 0, municipios: new Set<string>() };
    grupo.hbls += 1;
    grupo.paradas += Number(h.parada) || 0;
    grupo.bultos += Number(h.bultos) || 0;
    if (h.municipio) grupo.municipios.add(h.municipio);
    grupos.set(provincia, grupo);
  }

  return Array.from(grupos, ([provincia, grupo]) => ({
    provincia,
    hbls: grupo.hbls,
    paradas: grupo.paradas,
    bultos: grupo.bultos,
    municipios: Array.from(grupo.municipios),
  })).sort((a, b) => ordenarUbicaciones(a.provincia, b.provincia));
}

// Provincias primero en orden geográfico y después el resto por orden alfabético
function ordenarUbicaciones(a: string, b: string) {
  const indexA = ORDEN_PROVINCIAS.indexOf(a.toUpperCase());
  const indexB = ORDEN_PROVINCIAS.indexOf(b.toUpperCase());
  if (indexA !== -1 && indexB !== -1) return indexA - indexB;
  if (indexA !== -1) return -1;
  if (indexB !== -1) return 1;
  return a.localeCompare(b);
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
function ProvinciasContent() {
  const searchParams = useSearchParams();
  const provinciaSeleccionada = searchParams.get("nombre");
  const { metadata, manifiestoId } = useManifiesto();


  if (!metadata || !manifiestoId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <Upload className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">No hay manifiesto cargado</h1>
            <p className="text-slate-600 mb-6">Sube un manifiesto Excel para ver las provincias.</p>
            <Link href="/" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-6 py-3 rounded-lg transition-colors">
              <Upload className="w-5 h-5" /> Ir a Subir
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (provinciaSeleccionada) {
    return (
      <DetalleProvincia
        provincia={provinciaSeleccionada}
        manifiestoId={manifiestoId}
        metadata={metadata}
        busquedaInicial={searchParams.get("q") || ""}
        estadoInicial={searchParams.get("estado") || ""}
      />
    );
  }

  return (
    <ResumenProvincias
      manifiestoId={manifiestoId}
      metadata={metadata}
      busquedaInicial={searchParams.get("q") || ""}
      estadoInicial={searchParams.get("estado") || ""}
    />
  );
}

export default function ProvinciasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Cargando provincias...</div>}>
      <ProvinciasContent />
    </Suspense>
  );
}

// ============================================================
// VISTA 1: RESUMEN / TARJETAS
// ============================================================
function ResumenProvincias({ manifiestoId, metadata, busquedaInicial = "", estadoInicial = "" }: { manifiestoId: number, metadata: any, busquedaInicial?: string, estadoInicial?: string }) {
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [estado, setEstado] = useState(estadoInicial);
  const [ubicacion, setUbicacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [haBuscado, setHaBuscado] = useState(Boolean(busquedaInicial || estadoInicial));
  const [paradasBuscadas, setParadasBuscadas] = useState<any[] | null>(null);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtrosAplicados = useRef<[string, string]>(["", ""]);
  const primerRender = useRef(true);

  const cancelarDebounce = () => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  const aplicarFiltros = async () => {
    if (!manifiestoId) return;
    cancelarDebounce();
    filtrosAplicados.current = [estado, ubicacion];
    setCargando(true);
    setHaBuscado(true);
    setError(null);
    try {
      if (ubicacion) {
        const result = await buscarParadasPorMunicipio(manifiestoId, ubicacion);
        setParadasBuscadas(result.paradas);
        (metadata as any)._resumenFiltrado = null;
      } else if (busqueda || estado) {
        const hbls = await obtenerTodosLosHBLsFiltrados(manifiestoId, { busqueda, estado });
        setParadasBuscadas(null);
        (metadata as any)._resumenFiltrado = agruparHBLsPorProvincia(hbls);
      } else {
        setParadasBuscadas(null);
        (metadata as any)._resumenFiltrado = null;
      }
    } catch (err: any) {
      setError(err.message || "Error al aplicar filtros");
    } finally {
      setCargando(false);
    }
  };

  // Envuelve la función actual para poder llamarla desde el temporizador sin depender de ella
  const aplicarFiltrosDiferido = useEffectEvent(() => { void aplicarFiltros(); });

  // Al volver de una provincia recuperamos su búsqueda desde la URL (una sola vez, al montar).
  // Se lanza fuera del render para no encadenar el setState de aplicarFiltros en el efecto.
  useEffect(() => {
    if (!busquedaInicial && !estadoInicial) return;
    const id = setTimeout(() => aplicarFiltrosDiferido(), 0);
    return () => clearTimeout(id);
  }, [busquedaInicial, estadoInicial]);

  // Estado y ubicación se aplican solos, con un pequeño retardo, al cambiar
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      filtrosAplicados.current = [estado, ubicacion];
      return;
    }
    // Si ya están aplicados (Buscar o Limpiar), no se repite la petición
    if (filtrosAplicados.current[0] === estado && filtrosAplicados.current[1] === ubicacion) return;
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      filtrosAplicados.current = [estado, ubicacion];
      aplicarFiltrosDiferido();
    }, 400);
    return () => {
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
    };
  }, [estado, ubicacion]);

  const limpiarFiltros = () => {
    cancelarDebounce();
    filtrosAplicados.current = ["", ""];
    setBusqueda("");
    setEstado("");
    setUbicacion("");
    setHaBuscado(false);
    if (metadata) {
      (metadata as any)._hblsFiltrados = null;
      (metadata as any)._resumenFiltrado = null;
    }
  };

  const provinciasAMostrar = (metadata as any)._resumenFiltrado || metadata?.resumen || [];
  const totalHBLs = haBuscado ? provinciasAMostrar.reduce((s: number, p: any) => s + (p.hbls || 0), 0) : (metadata?.resumen || []).reduce((s: number, p: any) => s + (p.hbls || 0), 0);
  const totalParadas = provinciasAMostrar.reduce((s: number, p: any) => s + (p.paradas || 0), 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-semibold text-slate-900">{metadata.nombre_archivo}</h2>
            </div>
            <button
              onClick={async () => {
                try {
                  await exportarTodasProvinciasPorId(manifiestoId, metadata?.nombre_archivo || "");
                } catch (err) { toast.error("Error al exportar todas las provincias"); }
              }}
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm transition-all"
            >
              <Download className="w-4 h-4" /> Exportar todas
            </button>
          </div>

          <div className="flex flex-wrap gap-2">
            <Metric label="Total HBLs" value={totalHBLs} />
            <Metric label="Provincias" value={provinciasAMostrar.length} />
            <Metric label="Paradas totales" value={totalParadas} />
            <Metric label="Bultos totales" value={provinciasAMostrar.reduce((s: number, p: any) => s + (p.bultos || 0), 0)} />
          </div>
        </div>

        <FiltrosBusqueda
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          estado={estado}
          onEstado={setEstado}
          ubicacion={ubicacion}
          onUbicacion={setUbicacion}
          opcionesUbicacion={[
            ...Array.from(new Set((metadata?.resumen || []).map((p: any) => p.provincia))),
            ...Array.from(new Set((metadata?.resumen || []).flatMap((p: any) => p.municipios || []))),
          ].map(String).sort(ordenarUbicaciones)}
          provincias={Array.from(new Set((metadata?.resumen || []).map((p: any) => p.provincia)))}
          placeholderFiltro="HBL, remitente..."
          placeholderUbicacion="todas las ubicaciones"
          onBuscar={() => { void aplicarFiltros(); }}
          onLimpiar={limpiarFiltros}
          cargando={cargando}
        />

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Resumen por provincia</h3>
          <p className="text-sm text-slate-500 mb-4">
            {paradasBuscadas ? "Resultados de la búsqueda por municipio" : "Haz clic en una provincia para ver sus paradas"}
          </p>

          {haBuscado && (paradasBuscadas?.length === 0 || (!paradasBuscadas && provinciasAMostrar.length === 0)) ? (
            <div className="text-center py-12 text-slate-500">No hay resultados que coincidan con los filtros.</div>
          ) : paradasBuscadas ? (
            <div className="space-y-2">
              {paradasBuscadas.map((p, index) => (
                <ParadaCard
                  key={index}
                  parada={p}
                  manifiestoId={manifiestoId}
                  provincia={p.Municipio}
                  onUpdate={() => {}} 
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {provinciasAMostrar.map((p: ManifiestoResumen) => (
                <Link
                  key={p.provincia}
                  href={`/provincias?nombre=${encodeURIComponent(p.provincia)}${haBuscado && busqueda ? `&q=${encodeURIComponent(busqueda)}` : ""}${haBuscado && estado ? `&estado=${encodeURIComponent(estado)}` : ""}`}
                  className="border border-slate-200 rounded-lg p-4 text-left hover:border-primary/40 hover:shadow-md hover:bg-primary/5 transition-all group block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-slate-900">{p.provincia}</div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-primary transition-all" />
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-slate-600"><b>{p.hbls}</b> HBLs</span>
                    <span className="text-primary"><b>{p.paradas}</b> paradas</span>
                    <span className="text-slate-600"><b>{p.bultos}</b> bultos</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

// ============================================================
// VISTA 2: DETALLE
// ============================================================
function DetalleProvincia({ provincia, manifiestoId, metadata, busquedaInicial = "", estadoInicial = "" }: { provincia: string, manifiestoId: number, metadata: any, busquedaInicial?: string, estadoInicial?: string }) {
  const [paradas, setParadas] = useState<ParadasResponse | null>(null);
  const [loadingParadas, setLoadingParadas] = useState(true);
  const [tabActivo, setTabActivo] = useState<"paradas" | "dashboard">("paradas");
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState(busquedaInicial);
  const [estadoFiltro, setEstadoFiltro] = useState(estadoInicial);
  const [ubicacionFiltro, setUbicacionFiltro] = useState("");
  const [cargandoFiltro, setCargandoFiltro] = useState(false);
  const [totalSinFiltro, setTotalSinFiltro] = useState(0);

  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const filtrosAplicados = useRef<[string, string]>(["", ""]);
  const primerRender = useRef(true);

  const cancelarDebounce = () => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  useEffect(() => {
    cargarParadas();
  }, [manifiestoId, provincia]);

  const cargarParadas = async () => {
    setLoadingParadas(true);
    setError(null);
    try {
      const result = await obtenerProvinciaPorId(manifiestoId, provincia, busqueda, estadoFiltro, ubicacionFiltro);
      setParadas(result);
      setTotalSinFiltro(result.total_hbls_sin_filtro ?? result.total_hbls);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Error al cargar");
    } finally {
      setLoadingParadas(false);
    }
  };

  const actualizarParadaLocal = (municipio: string, direccion: string, nuevoEstado: string) => {
    if (!paradas) return;
    const nuevasParadas = paradas.paradas.map((p) => (p.Municipio === municipio && p["Dirección"] === direccion) ? { ...p, Estado: nuevoEstado } : p);
    setParadas({ ...paradas, paradas: nuevasParadas });
  };

  const aplicarFiltros = async () => {
    cancelarDebounce();
    filtrosAplicados.current = [estadoFiltro, ubicacionFiltro];
    setCargandoFiltro(true);
    setError(null);
    try {
      const result = await obtenerProvinciaPorId(manifiestoId, provincia, busqueda, estadoFiltro, ubicacionFiltro);
      setParadas(result);
      setTotalSinFiltro(result.total_hbls_sin_filtro ?? result.total_hbls);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Error al filtrar");
    } finally {
      setCargandoFiltro(false);
    }
  };

  // Envuelve la función actual para poder llamarla desde el temporizador sin depender de ella
  const aplicarFiltrosDiferido = useEffectEvent(() => { void aplicarFiltros(); });

  // Estado y ubicación se aplican solos, con un pequeño retardo, al cambiar
  useEffect(() => {
    if (primerRender.current) {
      primerRender.current = false;
      filtrosAplicados.current = [estadoFiltro, ubicacionFiltro];
      return;
    }
    // Si ya están aplicados (Buscar o Limpiar), no se repite la petición
    if (filtrosAplicados.current[0] === estadoFiltro && filtrosAplicados.current[1] === ubicacionFiltro) return;
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      filtrosAplicados.current = [estadoFiltro, ubicacionFiltro];
      aplicarFiltrosDiferido();
    }, 400);
    return () => {
      if (temporizador.current) {
        clearTimeout(temporizador.current);
        temporizador.current = null;
      }
    };
  }, [estadoFiltro, ubicacionFiltro]);

  const limpiarFiltros = async () => {
    cancelarDebounce();
    filtrosAplicados.current = ["", ""];
    setBusqueda(""); setEstadoFiltro(""); setUbicacionFiltro("");
    setCargandoFiltro(true);
    try {
      const result = await obtenerProvinciaPorId(manifiestoId, provincia);
      setParadas(result);
      setTotalSinFiltro(result.total_hbls_sin_filtro ?? result.total_hbls);
    } catch (err: any) {
      setError(err.message || "Error al limpiar");
    } finally {
      setCargandoFiltro(false);
    }
  };

  // Al volver a las tarjetas conservamos la búsqueda que nos trajo hasta aquí
  const parametrosVuelta = new URLSearchParams();
  if (busqueda) parametrosVuelta.set("q", busqueda);
  if (estadoFiltro) parametrosVuelta.set("estado", estadoFiltro);
  const queryVuelta = parametrosVuelta.toString();
  const volverHref = queryVuelta ? `/provincias?${queryVuelta}` : "/provincias";

  if (loadingParadas) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
          <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-slate-600">Cargando paradas de {provincia}...</p>
        </div>
      </main>
    );
  }

  if (error || !paradas) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
          <AlertTriangle className="mx-auto mb-4 h-14 w-14 text-red-400" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Error</h1>
          <p className="text-slate-600 mb-6">{error || "No se pudieron cargar las paradas"}</p>
          <Link href="/provincias" className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-6 py-3 rounded-lg transition-colors">
            ← Volver a provincias
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <Link href={volverHref} className="inline-flex items-center gap-2 text-slate-600 hover:text-primary text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Volver a provincias
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6 text-primary" />
              <h2 className="text-2xl font-bold text-slate-900">{paradas.provincia}</h2>
            </div>

            <details className="group relative">
              <summary className="list-none cursor-pointer inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors select-none">
                <Download className="w-4 h-4" /> <span>Descargar</span>
                <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                <button onClick={() => exportarProvinciaPorId(manifiestoId, paradas.provincia, metadata?.nombre_archivo || "")} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                  <Download className="w-4 h-4 text-slate-500" /> Exportar manifiesto
                </button>
                <button onClick={() => exportarHojaRutaPorId(manifiestoId, paradas.provincia, metadata?.nombre_archivo || "")} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                  <Truck className="w-4 h-4 text-slate-500" /> Hoja de ruta
                </button>
                <button onClick={() => exportarPorMunicipiosPorId(manifiestoId, paradas.provincia, metadata?.nombre_archivo || "")} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                  <MapPin className="w-4 h-4 text-slate-500" /> Exportar por municipios
                </button>
              </div>
            </details>
          </div>

          <div className="flex flex-wrap gap-2">
            <Metric label="HBLs" value={paradas.total_hbls} />
            <Metric label="Paradas" value={paradas.total_paradas} />
            <Metric label="Bultos" value={paradas.paradas.reduce((s, p) => s + p.Bultos, 0)} />
          </div>
        </div>

        {/* Filtros */}
        <FiltrosBusqueda
          busqueda={busqueda}
          onBusqueda={setBusqueda}
          estado={estadoFiltro}
          onEstado={setEstadoFiltro}
          ubicacion={ubicacionFiltro}
          onUbicacion={setUbicacionFiltro}
          opcionesUbicacion={[
            paradas.provincia,
            ...Array.from(new Set(paradas.paradas.map((p) => p.Municipio))),
          ].sort(ordenarUbicaciones)}
          provincias={[paradas.provincia]}
          placeholderFiltro="HBL, cliente..."
          placeholderUbicacion="todas las ubicaciones"
          onBuscar={() => { void aplicarFiltros(); }}
          onLimpiar={() => { void limpiarFiltros(); }}
          cargando={cargandoFiltro}
        />

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button onClick={() => setTabActivo("paradas")} className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tabActivo === "paradas" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
            <List className="w-4 h-4" />
            Paradas
          </button>
          <button onClick={() => setTabActivo("dashboard")} className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${tabActivo === "dashboard" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>
            <LayoutDashboard className="w-4 h-4" />
            Dashboard
          </button>
        </div>

        {tabActivo === "paradas" ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Paradas ({paradas.total_paradas})</h3>
            {paradas.paradas.length === 0 ? (
              <div className="text-center py-8 text-slate-500">No hay paradas que coincidan con los filtros.</div>
            ) : (
              <div className="space-y-2">
                {paradas.paradas.map((p) => (
                  <ParadaCard key={`${p.Municipio}-${p["Dirección"]}-${p.Parada}`} parada={p} manifiestoId={manifiestoId} provincia={paradas.provincia} onUpdate={(nuevoEstado) => actualizarParadaLocal(p.Municipio, p["Dirección"], nuevoEstado)} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <Dashboard paradas={paradas} />
        )}
      </div>
    </main>
  );
}

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================
function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-lg bg-slate-50 px-3 py-2">
      <span className="text-xl font-bold leading-none text-slate-900">{value}</span>
      <span className="text-xs text-slate-600">{label}</span>
    </div>
  );
}

function ParadaCard({ parada, manifiestoId, provincia, onUpdate }: { parada: ParadaInfo, manifiestoId: number, provincia: string, onUpdate: (n: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [hbls, setHbls] = useState<HBLRegistro[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const [confirmarTodas, setConfirmarTodas] = useState(false);

  const toggleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    
    if ((parada as any).hbls) {
      setHbls((parada as any).hbls);
      return;
    }
    
    if (hbls) return;
    setLoading(true);
    try {
      // Los HBLs se piden al backend ya filtrados por la parada; el listado
      // solo devuelve 200 por página, así que se recorre hasta el final.
      const result = await obtenerTodosLosHBLsFiltrados(manifiestoId, {
        provincia,
        municipio: parada.Municipio,
        direccion: parada["Dirección"],
      });
      setHbls(result);
    } catch (err: any) {
      console.error("Error al cargar HBLs:", err);
      toast.error(`No se pudieron cargar los HBLs: ${err.response?.data?.detail || err.message}`);
    } finally { setLoading(false); }
  };

  const marcarTodasEntregadas = async () => {
    if (!hbls || hbls.length === 0) return;
    setConfirmarTodas(false);
    setMarcandoTodas(true);
    try {
      await actualizarEstadosMasivos(hbls.map((h) => h.hbl), "Entregada");
      setHbls((prev) => prev ? prev.map((item) => ({ ...item, estado: "Entregada" })) : null);
      onUpdate("Entregada");
    } catch (err: any) { toast.error(`Error: ${err.response?.data?.detail || err.message}`); } finally { setMarcandoTodas(false); }
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden transition-colors hover:border-primary/30">
      <button onClick={toggleExpand} className="w-full text-left p-4 hover:bg-slate-50 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-xs font-bold">{parada.Parada}</span>
              <span className="font-medium text-slate-900 truncate">{parada.Destinatario || "—"}</span>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} />
            </div>
            <p className="text-sm text-slate-600 truncate">{parada["Dirección"]}</p>
            <p className="text-xs text-slate-500 mt-0.5">{parada.Municipio}</p>
          </div>
          <div className="flex gap-3 text-sm flex-shrink-0 text-center">
            <div><div className="font-bold text-slate-900">{parada["Cant HBLs"]}</div><div className="text-xs text-slate-500">HBLs</div></div>
            <div><div className="font-bold text-slate-900">{parada.Bultos}</div><div className="text-xs text-slate-500">Bultos</div></div>
            <div><div className="font-bold text-slate-900">{parada["Peso (Kg)"].toFixed(1)}</div><div className="text-xs text-slate-500">Kg</div></div>
          </div>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          {loading && <div className="flex items-center gap-2 text-primary text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Cargando HBLs...</div>}
          {!loading && hbls && (
            <>
              <div className="mb-3 flex justify-end">
                <button onClick={() => setConfirmarTodas(true)} disabled={marcandoTodas} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors">
                  {marcandoTodas ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Marcando...</> : <><CheckCircle className="w-3.5 h-3.5" /> Marcar toda la parada como Entregada</>}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead>
                    <tr className="border-b border-slate-200 text-left">
                      <th className="pb-2 font-semibold text-slate-700 w-[20%]">HBL</th>
                      <th className="pb-2 font-semibold text-slate-700 w-[45%]">Contenido</th>
                      <th className="pb-2 font-semibold text-slate-700 text-right w-[10%]">Bultos</th>
                      <th className="pb-2 font-semibold text-slate-700 text-right w-[10%]">Kg</th>
                      <th className="pb-2 font-semibold text-slate-700 text-right w-[15%]">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {hbls.map((h) => (
                      <tr key={h.hbl} className="border-b border-slate-100 last:border-0">
                        <td className="py-2 font-mono text-xs text-slate-800">{h.hbl}</td>
                        <td className="py-2 text-slate-700">{h.contenido || "—"}</td>
                        <td className="py-2 text-right text-slate-700">{h.bultos}</td>
                        <td className="py-2 text-right text-slate-700">{typeof h.peso === "number" ? h.peso.toFixed(2) : "—"}</td>
                        <td className="py-2 text-right">
                          <EstadoBadge estado={h.estado} hbl={h.hbl} onChange={(nuevo) => {
                            setHbls((prev) => prev ? prev.map((item) => item.hbl === h.hbl ? { ...item, estado: nuevo } : item) : null);
                            onUpdate(nuevo);
                          }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      <Modal
        isOpen={confirmarTodas}
        onClose={() => setConfirmarTodas(false)}
        title="Marcar parada como Entregada"
      >
        <p className="text-slate-600 mb-6">
          ¿Marcar los <b>{hbls?.length ?? 0}</b> paquete(s) de esta parada como <b>Entregada</b>?
        </p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => setConfirmarTodas(false)}
            className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={marcarTodasEntregadas}
            className="px-4 py-2 bg-primary hover:bg-primary/90 text-white font-medium rounded-lg transition-colors"
          >
            Marcar entregada
          </button>
        </div>
      </Modal>
    </div>
  );
}

function EstadoBadge({ estado, hbl, onChange }: { estado?: string, hbl: string, onChange?: (n: string) => void }) {
  const [valorActual, setValorActual] = useState(estado || "Pendiente");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (estado) setValorActual(estado); }, [estado]);

  const estados = ["Pendiente", "Despachada", "Devuelto Almacén", "Entregada"];
  const colores: Record<string, string> = {
    Pendiente: "bg-slate-100 text-slate-700 border-slate-200",
    Despachada: "bg-primary/10 text-primary border-primary/20",
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
    } finally { setGuardando(false); }
  };

  return (
    <div className="relative inline-flex items-center gap-1">
      {guardando && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
      <select
        value={valorActual}
        onChange={(e) => cambiarEstado(e.target.value)}
        disabled={guardando}
        className={`text-xs font-medium px-2 py-1 rounded-full border cursor-pointer outline-none appearance-none pr-6 ${color} ${guardando ? "opacity-60" : ""}`}
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