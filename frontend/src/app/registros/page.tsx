"use client";
import AutocompleteUbicacion from "@/components/AutocompleteUbicacion";
import { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  List,
  History,
  Phone,
  X,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { ORDEN_PROVINCIAS } from "@/lib/provincias";
import { obtenerTodosLosHBLs, actualizarEstado, obtenerHistorial, type HBLRegistro,
  type HBLsPaginaResponse, type CambioEstado,
} from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";

const ESTADOS = ["Pendiente", "Despachada", "Devuelto Almacén", "Entregada"];
const OPCIONES_POR_PAGINA = [15, 25, 50, 100];
const POR_PAGINA_DEFECTO = OPCIONES_POR_PAGINA[0];

type ChipFiltro = {
  clave: "manifiesto" | "q" | "estado" | "ubicacion";
  campo: string;
  etiqueta: string;
  valor?: string;
};

function RegistrosContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { metadata, manifiestos, loadingManifiestos } = useManifiesto();
  const manifiestoActivoId = metadata?.id ?? null;

  // La URL es la fuente de verdad de los filtros: recargar o compartir el
  // enlace devuelve exactamente la misma vista.
  const manifiestoFiltro = searchParams.get("manifiesto") || "activo";
  const busqueda = searchParams.get("q") || "";
  const estadoFiltro = searchParams.get("estado") || "";
  const provinciaFiltro = (searchParams.get("ubicacion") || "")
    .split(",")
    .map((valor) => valor.trim())
    .filter(Boolean);
  // Página y tamaño solo admiten valores válidos: un enlace manipulado no
  // puede pedir una página imposible ni un tamaño fuera del selector.
  const paginaParam = Number(searchParams.get("pagina"));
  const pagina = Number.isInteger(paginaParam) && paginaParam >= 1 ? paginaParam : 1;
  const porPaginaParam = searchParams.get("porPagina");
  const porPagina = OPCIONES_POR_PAGINA.includes(Number(porPaginaParam))
    ? Number(porPaginaParam)
    : POR_PAGINA_DEFECTO;

  // Solo el texto se escribe en local; pasa a la URL con Enter o el botón.
  const [texto, setTexto] = useState(busqueda);
  const [datos, setDatos] = useState<HBLsPaginaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Mantiene el input al día si la URL cambia (chips, atrás/adelante).
  useEffect(() => {
    setTexto(busqueda);
  }, [busqueda]);

  const actualizarUrl = (cambios: Record<string, string | string[] | null>) => {
    // Se parte de la URL viva y no del `searchParams` del render: una respuesta
    // asíncrona puede llegar después de otra navegación y resucitar valores viejos.
    const params = new URLSearchParams(
      typeof window === "undefined" ? searchParams.toString() : window.location.search
    );
    Object.entries(cambios).forEach(([clave, valor]) => {
      const limpio = Array.isArray(valor) ? valor.join(",") : valor;
      if (limpio) params.set(clave, limpio);
      else params.delete(clave);
    });
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // El selector puede apuntar al manifiesto activo, a uno concreto o a todos;
  // null significa "todos" (el backend no filtra).
  const manifiestoEnFoco =
    manifiestoFiltro === "todos"
      ? null
      : manifiestoFiltro === "activo"
        ? metadata
        : manifiestos.find((m) => String(m.id) === manifiestoFiltro) ?? null;

  // Con "Manifiesto activo" esperamos al contexto y con un id concreto a la
  // lista, para no pedir en la primera carga los HBLs del manifiesto equivocado.
  const esperandoContexto =
    (manifiestoFiltro === "activo" && !manifiestoActivoId) ||
    (manifiestoFiltro !== "activo" &&
      manifiestoFiltro !== "todos" &&
      loadingManifiestos);
  const idParaFiltrar = manifiestoEnFoco?.id ?? null;
  const claveUbicacion = provinciaFiltro.join(",");

  // Un tamaño que no está en el selector se descarta también de la URL, para
  // que el enlace no anuncie algo distinto de lo que se ve.
  useEffect(() => {
    if (porPaginaParam === null) return;
    if (OPCIONES_POR_PAGINA.includes(Number(porPaginaParam))) return;
    actualizarUrl({ porPagina: null });
  }, [porPaginaParam]);

  useEffect(() => {
    if (esperandoContexto) return;
    let cancelado = false;

    const cargar = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await obtenerTodosLosHBLs(
          idParaFiltrar,
          pagina,
          porPagina,
          busqueda,
          estadoFiltro,
          claveUbicacion
        );
        if (cancelado) return;

        // Si la página pedida ya no existe (enlace viejo, o filtros que dejan
        // menos resultados) se muestra la última en lugar de una tabla vacía.
        if (result.total_paginas > 0 && pagina > result.total_paginas) {
          const ultima = result.total_paginas;
          const corregido = await obtenerTodosLosHBLs(
            idParaFiltrar,
            ultima,
            porPagina,
            busqueda,
            estadoFiltro,
            claveUbicacion
          );
          if (cancelado) return;
          setDatos(corregido);
          actualizarUrl({ pagina: ultima > 1 ? String(ultima) : null });
          return;
        }

        setDatos(result);
      } catch (err: any) {
        if (!cancelado) setError(err.message || "Error al cargar los registros");
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    cargar();
    return () => {
      cancelado = true;
    };
  }, [
    idParaFiltrar,
    pagina,
    porPagina,
    busqueda,
    estadoFiltro,
    claveUbicacion,
    esperandoContexto,
  ]);

  const cambiarManifiesto = (valor: string) =>
    actualizarUrl({
      manifiesto: valor === "activo" ? null : valor,
      pagina: null,
    });

  const aplicarBusqueda = () =>
    actualizarUrl({ q: texto.trim() || null, pagina: null });

  const cambiarEstado = (valor: string) =>
    actualizarUrl({ estado: valor || null, pagina: null });

  const cambiarUbicaciones = (valores: string[]) =>
    actualizarUrl({ ubicacion: valores, pagina: null });

  const cambiarPagina = (nueva: number) => {
    if (nueva < 1 || (datos && nueva > datos.total_paginas)) return;
    actualizarUrl({ pagina: nueva > 1 ? String(nueva) : null });
  };

  const cambiarPorPagina = (nuevo: number) =>
    actualizarUrl({
      porPagina: nuevo === POR_PAGINA_DEFECTO ? null : String(nuevo),
      pagina: null,
    });

  const quitarFiltro = (clave: ChipFiltro["clave"], valor?: string) => {
    if (clave === "ubicacion") {
      actualizarUrl({
        ubicacion: provinciaFiltro.filter((ubicacion) => ubicacion !== valor),
        pagina: null,
      });
      return;
    }
    actualizarUrl({ [clave]: null, pagina: null });
  };

  const limpiarFiltros = () =>
    actualizarUrl({
      manifiesto: null,
      q: null,
      estado: null,
      ubicacion: null,
      pagina: null,
    });

  // Chips de lo que está aplicado, para poder quitar cada filtro por separado.
  const chips: ChipFiltro[] = [];
  if (manifiestoFiltro !== "activo") {
    chips.push({
      clave: "manifiesto",
      campo: "Manifiesto",
      etiqueta: manifiestoEnFoco?.nombre_archivo ?? "Todos los manifiestos",
    });
  }
  if (busqueda) {
    chips.push({ clave: "q", campo: "Búsqueda", etiqueta: `“${busqueda}”` });
  }
  if (estadoFiltro) {
    chips.push({ clave: "estado", campo: "Estado", etiqueta: estadoFiltro });
  }
  provinciaFiltro.forEach((ubicacion) =>
    chips.push({
      clave: "ubicacion",
      valor: ubicacion,
      campo: "Ubicación",
      etiqueta: ubicacion,
    })
  );

  // Sin datos
  if (!metadata) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <List className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              No hay manifiesto cargado
            </h1>
            <p className="text-slate-600 mb-6">
              Sube un manifiesto Excel para ver los registros.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              Ir a Subir
            </Link>
          </div>
        </div>
      </main>
    );
  }

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

  // La cabecera sigue al filtro: si se miran todos los manifiestos o uno
  // concreto, no debe anunciar los datos del que está activo.
  const subtitulo = manifiestoEnFoco
    ? `${manifiestoEnFoco.nombre_archivo} · ${manifiestoEnFoco.total_filas} HBLs`
    : `Todos los manifiestos · ${datos?.total ?? 0} HBLs`;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <List className="w-6 h-6 text-primary" />
            Registros
          </h1>
          <p className="text-slate-600 text-sm mt-1">{subtitulo}</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-700">{error}</div>
          </div>
        )}

        {/* Filtros: siempre visibles, con chips de lo aplicado */}
        <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <div className="w-full min-w-0 lg:w-56">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Manifiesto
              </label>
              <select
                value={manifiestoFiltro}
                onChange={(e) => cambiarManifiesto(e.target.value)}
                className="w-full px-3 h-[42px] border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="activo">Manifiesto activo</option>
                <option value="todos">Todos los manifiestos</option>
                {manifiestos.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.nombre_archivo}
                  </option>
                ))}
              </select>
            </div>

            <div className="w-full min-w-0 lg:w-80">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Filtro
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder="HBL, remitente, destinatario..."
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") aplicarBusqueda();
                  }}
                  className="h-[42px] bg-white focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
                <Button
                  onClick={aplicarBusqueda}
                  disabled={loading || texto.trim() === busqueda}
                  aria-label="Buscar"
                  className="!h-[42px] !px-3"
                >
                  <Search className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="w-full min-w-0 lg:w-64">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Provincia / Municipio
              </label>
              <AutocompleteUbicacion
                values={provinciaFiltro}
                onChange={cambiarUbicaciones}
                opciones={ubicacionesFinales}
                provincias={metadata?.resumen.map((p) => p.provincia) || []}
                placeholder="todas las ubicaciones"
              />
            </div>

            <div className="w-full min-w-0 lg:w-44">
              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                Estado
              </label>
              <select
                value={estadoFiltro || "todos"}
                onChange={(e) =>
                  cambiarEstado(!e.target.value || e.target.value === "todos" ? "" : e.target.value)
                }
                className="w-full px-3 h-[42px] border border-slate-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="todos">Todos</option>
                {ESTADOS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Chips: cada filtro aplicado se puede quitar por separado */}
          <div className="flex flex-wrap items-center gap-2">
            {chips.length === 0 ? (
              <span className="text-xs text-slate-500">
                Sin filtros aplicados: se muestra todo el manifiesto.
              </span>
            ) : (
              <>
                {chips.map((chip) => (
                  <span
                    key={`${chip.clave}-${chip.valor ?? ""}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 py-1 pl-2.5 pr-1 text-xs text-slate-700"
                  >
                    <span className="text-slate-500">{chip.campo}:</span>
                    <span
                      className="max-w-[16rem] truncate font-medium"
                      title={chip.etiqueta}
                    >
                      {chip.etiqueta}
                    </span>
                    <button
                      type="button"
                      onClick={() => quitarFiltro(chip.clave, chip.valor)}
                      className="rounded-full p-0.5 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900"
                      aria-label={`Quitar filtro ${chip.campo}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={limpiarFiltros}
                  className="ml-1 text-xs font-medium text-primary hover:underline"
                >
                  Limpiar todo
                </button>
              </>
            )}
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
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
                  {OPCIONES_POR_PAGINA.map((cantidad) => (
                    <option key={cantidad} value={cantidad}>
                      {cantidad}
                    </option>
                  ))}
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
                aria-label="Página anterior"
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
                aria-label="Página siguiente"
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

// `useSearchParams` necesita un límite de Suspense en el render estático.
export default function RegistrosPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
          <div className="mx-auto max-w-7xl py-12 text-center text-slate-500">
            Cargando registros...
          </div>
        </main>
      }
    >
      <RegistrosContent />
    </Suspense>
  );
}

// ============================================================
// Fila de registro
// ============================================================
function FilaRegistro({ hbl }: { hbl: HBLRegistro }) {
  const [estado, setEstado] = useState(hbl.estado);
  const [guardando, setGuardando] = useState(false);

  // Historial de cambios del HBL, que se pide al abrir el modal.
  const [historialAbierto, setHistorialAbierto] = useState(false);
  const [historial, setHistorial] = useState<CambioEstado[] | null>(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null);

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

  const abrirHistorial = async () => {
    setHistorialAbierto(true);
    setCargandoHistorial(true);
    setErrorHistorial(null);
    setHistorial(null);
    try {
      setHistorial(await obtenerHistorial(hbl.hbl));
    } catch (err) {
      console.error("Error al cargar el historial:", err);
      setErrorHistorial("No se pudo cargar el historial. Inténtalo de nuevo.");
    } finally {
      setCargandoHistorial(false);
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
            <div className="flex items-center gap-1 text-[10px] text-slate-500" title={hbl.telefono}>
              <Phone className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{hbl.telefono}</span>
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

      {/* 6. Estado + historial */}
      <div className="flex items-center gap-1.5 md:justify-end">
        <button
          type="button"
          onClick={abrirHistorial}
          title="Ver historial de cambios"
          aria-label={`Ver historial de ${hbl.hbl}`}
          className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <History className="w-3.5 h-3.5" />
        </button>
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

      <Modal
        isOpen={historialAbierto}
        onClose={() => setHistorialAbierto(false)}
        title="Historial de estados"
      >
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-mono text-sm font-semibold text-slate-900">
              {hbl.hbl}
            </span>
            <span className="text-xs text-slate-500">Más reciente primero</span>
          </div>

          {cargandoHistorial ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : errorHistorial ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {errorHistorial}
            </p>
          ) : historial && historial.length > 0 ? (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {historial.map((cambio, indice) => (
                <li
                  key={`${cambio.fecha_hora}-${indice}`}
                  className="rounded-lg border border-slate-200 p-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        colores[cambio.estado] || colores.Pendiente
                      }`}
                    >
                      {cambio.estado}
                    </span>
                    <span className="text-[11px] text-slate-500">{cambio.fecha_hora}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-700">
                    {cambio.usuario || "—"}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
              Sin cambios registrados: el estado actual es el que venía en el manifiesto.
            </p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setHistorialAbierto(false)}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
            >
              Cerrar
            </button>
          </div>
        </div>
      </Modal>

    </div>
  );
}