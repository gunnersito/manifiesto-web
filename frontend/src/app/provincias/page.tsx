"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import AutocompleteUbicacion from "@/components/AutocompleteUbicacion";
import {
  CheckCircle,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  Upload,
  Download,
  MapPin,
  Loader2,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import {
  exportarTodasProvinciasPorId,
  obtenerHBLsManifiesto,
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

// ============================================================
// COMPONENTE PRINCIPAL (INTERNO)
// ============================================================
function ProvinciasContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Leemos la provincia de la URL (?nombre=...)
  const provinciaSeleccionada = searchParams.get("nombre");
  const { metadata, manifiestoId } = useManifiesto();

  if (!metadata || !manifiestoId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="text-6xl mb-4">📤</div>
            <h1 className="text-2xl font-bold text-slate-900 mb-2">No hay manifiesto cargado</h1>
            <p className="text-slate-600 mb-6">Sube un manifiesto Excel para ver las provincias.</p>
            <Link href="/" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors">
              <Upload className="w-5 h-5" /> Ir a Subir
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // Si hay una provincia en la URL, mostramos el detalle
  if (provinciaSeleccionada) {
    return <DetalleProvincia provincia={provinciaSeleccionada} manifiestoId={manifiestoId} metadata={metadata} />;
  }

  // Si no hay provincia en la URL, mostramos las tarjetas (Resumen)
  return <ResumenProvincias manifiestoId={manifiestoId} metadata={metadata} />;
}

// ============================================================
// EXPORTACIÓN CON SUSPENSE
// ============================================================
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
function ResumenProvincias({ manifiestoId, metadata }: { manifiestoId: number, metadata: any }) {
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState("");
  const [ubicacion, setUbicacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provinciasFiltradas: ManifiestoResumen[] = (metadata?.resumen || []).filter((p: any) => {
    if (ubicacion && p.provincia !== ubicacion) return false;
    return true;
  });

  const aplicarFiltros = async () => {
    if (!manifiestoId) return;
    setCargando(true);
    setError(null);
    try {
      if (busqueda || estado) {
        const result = await obtenerHBLsManifiesto(manifiestoId, 1, 9999, busqueda, estado, ubicacion);
        const resumen: Record<string, ManifiestoResumen> = {};
        for (const h of result.hbls) {
          if (!resumen[h.provincia]) {
            resumen[h.provincia] = { provincia: h.provincia, hbls: 0, paradas: 0, bultos: 0 };
          }
          resumen[h.provincia].hbls += 1;
          resumen[h.provincia].paradas += h.parada;
          resumen[h.provincia].bultos += h.bultos;
        }
        (metadata as any)._resumenFiltrado = Object.values(resumen);
      }
    } catch (err: any) {
      setError(err.message || "Error al aplicar filtros");
    } finally {
      setCargando(false);
    }
  };

  const limpiarFiltros = () => {
    setBusqueda("");
    setEstado("");
    setUbicacion("");
    if (metadata) (metadata as any)._resumenFiltrado = null;
  };

  const provinciasAMostrar = (metadata as any)._resumenFiltrado || provinciasFiltradas;
  const totalHBLs = provinciasAMostrar.reduce((s: number, p: ManifiestoResumen) => s + p.hbls, 0);
  const totalParadas = provinciasAMostrar.reduce((s: number, p: ManifiestoResumen) => s + p.paradas, 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h2 className="text-xl font-semibold text-slate-900">{metadata.nombre_archivo}</h2>
            </div>
            <button
              onClick={async () => {
                try {
                  await exportarTodasProvinciasPorId(manifiestoId, metadata?.nombre_archivo || "");
                } catch (err) { alert("Error al exportar todas las provincias"); }
              }}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg shadow-sm transition-all"
            >
              <Download className="w-4 h-4" /> Exportar todas
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Metric label="Total HBLs" value={totalHBLs} />
            <Metric label="Provincias" value={provinciasAMostrar.length} />
            <Metric label="Paradas totales" value={totalParadas} />
            <Metric label="Bultos totales" value={provinciasAMostrar.reduce((s: number, p: ManifiestoResumen) => s + p.bultos, 0)} />
          </div>
        </div>

        <details className="group bg-white rounded-lg border border-slate-200">
          <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-3 select-none flex-wrap">
            <div className="flex items-center gap-2">
              <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
              <span className="font-semibold text-slate-900">Filtros de Búsqueda</span>
              {(busqueda || estado || ubicacion) && (
                <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full">activos</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={(e) => { e.preventDefault(); aplicarFiltros(); }} disabled={cargando}>
                {cargando ? "Buscando..." : "Buscar"}
              </Button>
              <Button variant="outline" onClick={(e) => { e.preventDefault(); limpiarFiltros(); }} disabled={cargando}>
                Limpiar
              </Button>
            </div>
          </summary>

          <div className="p-4 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Filtro</Label>
                <Input placeholder="orden, cliente, descripción" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ubicación</Label>
                <AutocompleteUbicacion value={ubicacion} onChange={setUbicacion} opciones={[...Array.from(new Set((metadata?.resumen || []).map((p: any) => p.provincia))).sort()] as string[]} placeholder="todas las ubicaciones" />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={estado || "todos"} onValueChange={(v) => setEstado(v === "todos" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="todos los estados" /></SelectTrigger>
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
          </div>
        </details>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Resumen por provincia</h3>
          <p className="text-sm text-slate-500 mb-4">Haz clic en una provincia para ver sus paradas</p>

          {provinciasAMostrar.length === 0 ? (
            <div className="text-center py-12 text-slate-500">No hay provincias que coincidan con los filtros.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {provinciasAMostrar.map((p: ManifiestoResumen) => (
                <Link
                  key={p.provincia}
                  href={`/provincias?nombre=${encodeURIComponent(p.provincia)}`}
                  className="border border-slate-200 rounded-lg p-4 text-left hover:border-blue-400 hover:shadow-md hover:bg-blue-50/30 transition-all group block"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="font-medium text-slate-900">{p.provincia}</div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-all" />
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span className="text-slate-600"><b>{p.hbls}</b> HBLs</span>
                    <span className="text-blue-600"><b>{p.paradas}</b> paradas</span>
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
function DetalleProvincia({ provincia, manifiestoId, metadata }: { provincia: string, manifiestoId: number, metadata: any }) {
  const [paradas, setParadas] = useState<ParadasResponse | null>(null);
  const [loadingParadas, setLoadingParadas] = useState(true);
  const [tabActivo, setTabActivo] = useState<"paradas" | "dashboard">("paradas");
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [ubicacionFiltro, setUbicacionFiltro] = useState("");
  const [cargandoFiltro, setCargandoFiltro] = useState(false);
  const [totalSinFiltro, setTotalSinFiltro] = useState(0);

  useEffect(() => {
    cargarParadas();
  }, [manifiestoId, provincia]);

  const cargarParadas = async () => {
    setLoadingParadas(true);
    setError(null);
    try {
      const result = await obtenerProvinciaPorId(manifiestoId, provincia);
      setParadas(result);
      setTotalSinFiltro(result.total_hbls_sin_filtro);
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
    setCargandoFiltro(true);
    setError(null);
    try {
      const result = await obtenerProvinciaPorId(manifiestoId, provincia, busqueda, estadoFiltro, ubicacionFiltro);
      setParadas(result);
      setTotalSinFiltro(result.total_hbls_sin_filtro);
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || "Error al filtrar");
    } finally {
      setCargandoFiltro(false);
    }
  };

  const limpiarFiltros = async () => {
    setBusqueda(""); setEstadoFiltro(""); setUbicacionFiltro("");
    setCargandoFiltro(true);
    try {
      const result = await obtenerProvinciaPorId(manifiestoId, provincia);
      setParadas(result);
      setTotalSinFiltro(result.total_hbls_sin_filtro);
    } catch (err: any) {
      setError(err.message || "Error al limpiar");
    } finally {
      setCargandoFiltro(false);
    }
  };

  if (loadingParadas) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-600">Cargando paradas de {provincia}...</p>
        </div>
      </main>
    );
  }

  if (error || !paradas) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Error</h1>
          <p className="text-slate-600 mb-6">{error || "No se pudieron cargar las paradas"}</p>
          <Link href="/provincias" className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-3 rounded-lg transition-colors">
            ← Volver a provincias
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <Link href="/provincias" className="inline-flex items-center gap-2 text-slate-600 hover:text-blue-600 text-sm transition-colors">
          <ChevronLeft className="w-4 h-4" /> Volver a provincias
        </Link>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <div className="flex items-center gap-3">
              <MapPin className="w-6 h-6 text-blue-600" />
              <h2 className="text-2xl font-bold text-slate-900">{paradas.provincia}</h2>
            </div>

            <details className="group relative">
              <summary className="list-none cursor-pointer inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors select-none">
                <span>📥</span> <span>Descargar</span>
                <ChevronDown className="w-4 h-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 mt-1 w-56 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
                <button onClick={() => exportarProvinciaPorId(manifiestoId, paradas.provincia, metadata?.nombre_archivo || "")} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                  <span>📥</span> Exportar manifiesto
                </button>
                <button onClick={() => exportarHojaRutaPorId(manifiestoId, paradas.provincia, metadata?.nombre_archivo || "")} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                  <span>🚚</span> Hoja de ruta
                </button>
                <button onClick={() => exportarPorMunicipiosPorId(manifiestoId, paradas.provincia, metadata?.nombre_archivo || "")} className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-3">
                  <span>📍</span> Exportar por municipios
                </button>
              </div>
            </details>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Metric label="HBLs" value={paradas.total_hbls} />
            <Metric label="Paradas" value={paradas.total_paradas} />
            <Metric label="Bultos" value={paradas.paradas.reduce((s, p) => s + p.Bultos, 0)} />
          </div>
        </div>

        {/* Filtros */}
        <details className="group bg-white rounded-lg border border-slate-200">
          <summary className="list-none cursor-pointer p-4 flex items-center justify-between gap-3 select-none flex-wrap">
            <div className="flex items-center gap-2">
              <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
              <span className="font-semibold text-slate-900">Filtros de Búsqueda</span>
            </div>
            <div className="flex gap-2">
              <Button onClick={(e) => { e.preventDefault(); aplicarFiltros(); }} disabled={cargandoFiltro}>{cargandoFiltro ? "Buscando..." : "Buscar"}</Button>
              <Button variant="outline" onClick={(e) => { e.preventDefault(); limpiarFiltros(); }} disabled={cargandoFiltro}>Limpiar</Button>
            </div>
          </summary>
          <div className="p-4 border-t border-slate-200">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Filtro</Label>
                <Input placeholder="orden, cliente, descripción" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Ubicación</Label>
                <AutocompleteUbicacion value={ubicacionFiltro} onChange={setUbicacionFiltro} opciones={[paradas.provincia, ...Array.from(new Set(paradas.paradas.map((p) => p.Municipio))).sort()]} placeholder="todas las ubicaciones" />
              </div>
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={estadoFiltro || "todos"} onValueChange={(v) => setEstadoFiltro(v === "todos" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="todos los estados" /></SelectTrigger>
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
          </div>
        </details>

        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          <button onClick={() => setTabActivo("paradas")} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tabActivo === "paradas" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>📋 Paradas</button>
          <button onClick={() => setTabActivo("dashboard")} className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${tabActivo === "dashboard" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`}>📊 Dashboard</button>
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
    <div className="bg-slate-50 rounded-lg p-4">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600 mt-1">{label}</div>
    </div>
  );
}

function ParadaCard({ parada, manifiestoId, provincia, onUpdate }: { parada: ParadaInfo, manifiestoId: number, provincia: string, onUpdate: (n: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const [hbls, setHbls] = useState<HBLRegistro[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [marcandoTodas, setMarcandoTodas] = useState(false);

  const toggleExpand = async () => {
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (hbls) return;
    setLoading(true);
    try {
      const result = await obtenerHBLsManifiesto(manifiestoId, 1, 9999, "", "", provincia);
      setHbls(result.hbls.filter((h) => h.municipio === parada.Municipio && h.direccion === parada["Dirección"]));
    } catch (err) { console.error("Error al cargar HBLs:", err); } finally { setLoading(false); }
  };

  const marcarTodasEntregadas = async () => {
    if (!hbls || hbls.length === 0) return;
    if (!confirm(`¿Marcar los ${hbls.length} paquete(s) de esta parada como Entregada?`)) return;
    setMarcandoTodas(true);
    try {
      await actualizarEstadosMasivos(hbls.map((h) => h.hbl), "Entregada");
      setHbls((prev) => prev ? prev.map((item) => ({ ...item, estado: "Entregada" })) : null);
      onUpdate("Entregada");
    } catch (err: any) { alert(`Error: ${err.response?.data?.detail || err.message}`); } finally { setMarcandoTodas(false); }
  };

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden transition-colors hover:border-blue-300">
      <button onClick={toggleExpand} className="w-full text-left p-4 hover:bg-slate-50 transition-colors">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{parada.Parada}</span>
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
          {loading && <div className="flex items-center gap-2 text-blue-600 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Cargando HBLs...</div>}
          {!loading && hbls && (
            <>
              <div className="mb-3 flex justify-end">
                <button onClick={marcarTodasEntregadas} disabled={marcandoTodas} className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors">
                  {marcandoTodas ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Marcando...</> : <><CheckCircle className="w-3.5 h-3.5" /> Marcar toda la parada como Entregada</>}
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-semibold text-slate-700">HBL</th>
                    <th className="pb-2 font-semibold text-slate-700">Contenido</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">Bultos</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">Kg</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">Estado</th>
                  </tr></thead>
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