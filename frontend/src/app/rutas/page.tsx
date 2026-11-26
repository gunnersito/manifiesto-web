"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  Loader2,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Route,
  Search,
  Trash2,
  Truck,
  Upload,
  Warehouse,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { ORDEN_PROVINCIAS } from "@/lib/provincias";
import {
  asignarRepartidor,
  asignarRepartidorATodos,
  asignarSalidaRuta,
  buscarPuntoPartida,
  buscarUbicacionParada,
  corregirUbicacionParada,
  crearPuntoPartida,
  crearRepartidor,
  descargarRutaRepartidorExcel,
  eliminarPuntoPartida,
  eliminarRepartidor,
  obtenerPuntosPartida,
  obtenerRepartidores,
  obtenerResumenRutas,
  obtenerRutaRepartidor,
  prepararCoordenadas,
  quitarCorreccionParada,
  type ParadaRuta,
  type ProgresoGeocodificacion,
  type PuntoPartida,
  type ResultadoLugar,
  type ResumenRutas,
  type RutaRepartidor,
} from "@/lib/api";

// Provincias en el mismo orden geográfico que el resto de la app.
function ordenarProvincias(lista: string[]) {
  return [...lista].sort((a, b) => {
    const ia = ORDEN_PROVINCIAS.indexOf(a.toUpperCase());
    const ib = ORDEN_PROVINCIAS.indexOf(b.toUpperCase());
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1;
    if (ib !== -1) return 1;
    return a.localeCompare(b);
  });
}

export default function RutasPage() {
  const { metadata, manifiestoId } = useManifiesto();

  const [isAdmin, setIsAdmin] = useState(false);
  const [provincia, setProvincia] = useState("");
  const [resumen, setResumen] = useState<ResumenRutas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [repartidores, setRepartidores] = useState<string[]>([]);
  const [puntos, setPuntos] = useState<PuntoPartida[]>([]);
  const [nuevoRepartidor, setNuevoRepartidor] = useState("");
  const [asignandoTodos, setAsignandoTodos] = useState(false);
  const [repartidorSel, setRepartidorSel] = useState("");
  const [ruta, setRuta] = useState<RutaRepartidor | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [geocodificando, setGeocodificando] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoGeocodificacion | null>(null);
  const [exportandoRuta, setExportandoRuta] = useState(false);
  const [correccion, setCorreccion] = useState<{
    parada: ParadaRuta;
    direccion: string;
    lat: string;
    lon: string;
    corregida: boolean;
  } | null>(null);
  const [guardandoCorreccion, setGuardandoCorreccion] = useState(false);
  const [buscandoCoordenadas, setBuscandoCoordenadas] = useState(false);
  const [nuevaBase, setNuevaBase] = useState<{
    nombre: string;
    direccion: string;
    lat: string;
    lon: string;
  } | null>(null);
  const [guardandoBase, setGuardandoBase] = useState(false);
  const [buscandoBase, setBuscandoBase] = useState(false);
  // Resultados de la búsqueda de la base y avisos, dentro del modal: un toast
  // queda detrás del <dialog> y no se ve.
  const [resultadosBase, setResultadosBase] = useState<ResultadoLugar[]>([]);
  const [respaldoBase, setRespaldoBase] = useState(false);
  const [resultadoSel, setResultadoSel] = useState<number | null>(null);
  const [errorBase, setErrorBase] = useState<string | null>(null);
  // Confirmación pendiente, siempre con el mismo modal del resto de la app.
  const [confirmacion, setConfirmacion] = useState<{
    titulo: string;
    mensaje: ReactNode;
    accion: string;
    peligro?: boolean;
    alConfirmar: () => void;
    alCancelar?: () => void;
  } | null>(null);
  // Sube cada vez que cambia algo que afecta a la ruta (asignaciones,
  // coordenadas nuevas) para volver a pedirla aunque el repartidor sea el mismo.
  const [versionRuta, setVersionRuta] = useState(0);

  useEffect(() => {
    setIsAdmin(Cookies.get("role") === "admin");
  }, []);

  const provincias = useMemo(
    () => ordenarProvincias(metadata?.resumen.map((r) => r.provincia) ?? []),
    [metadata]
  );

  useEffect(() => {
    if (!provincia && provincias.length > 0) setProvincia(provincias[0]);
  }, [provincias, provincia]);

  const cargarResumen = useCallback(async () => {
    if (!manifiestoId || !provincia) return;
    setCargando(true);
    setError(null);
    try {
      const [datos, nombres, bases] = await Promise.all([
        obtenerResumenRutas(manifiestoId, provincia),
        obtenerRepartidores(),
        obtenerPuntosPartida(),
      ]);
      setResumen(datos);
      setRepartidores(nombres);
      setPuntos(bases);
      setRepartidorSel((actual) => {
        if (actual && datos.repartidores.some((r) => r.nombre === actual && r.municipios.length > 0)) {
          return actual;
        }
        return datos.repartidores.find((r) => r.municipios.length > 0)?.nombre ?? "";
      });
    } catch (err: any) {
      setResumen(null);
      setError(
        err?.response?.data?.detail || "No se pudo cargar la provincia en este manifiesto"
      );
    } finally {
      setCargando(false);
    }
  }, [manifiestoId, provincia]);

  const cargarRuta = useCallback(async () => {
    if (!manifiestoId || !provincia || !repartidorSel) {
      setRuta(null);
      return;
    }
    setCargandoRuta(true);
    try {
      setRuta(
        await obtenerRutaRepartidor(manifiestoId, repartidorSel, provincia, soloPendientes)
      );
    } catch {
      setRuta(null);
      toast.error("No se pudo calcular la ruta");
    } finally {
      setCargandoRuta(false);
    }
  }, [manifiestoId, provincia, repartidorSel, soloPendientes, versionRuta]);

  useEffect(() => {
    cargarResumen();
  }, [cargarResumen]);

  useEffect(() => {
    cargarRuta();
  }, [cargarRuta]);

  const agregarRepartidor = async (evento: React.FormEvent) => {
    evento.preventDefault();
    const nombre = nuevoRepartidor.trim();
    if (!nombre) return;
    try {
      setRepartidores(await crearRepartidor(nombre));
      setNuevoRepartidor("");
      toast.success(`${nombre} añadido`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || "No se pudo añadir el repartidor");
    }
  };

  const borrarRepartidor = (nombre: string) => {
    setConfirmacion({
      titulo: "Confirmar eliminación",
      mensaje: (
        <>
          ¿Eliminar a <b>{nombre}</b>? Sus municipios quedarán sin asignar.
        </>
      ),
      accion: "Eliminar",
      peligro: true,
      alConfirmar: () => void eliminarRepartidorConfirmado(nombre),
    });
  };

  const eliminarRepartidorConfirmado = async (nombre: string) => {
    try {
      setRepartidores(await eliminarRepartidor(nombre));
      if (repartidorSel === nombre) setRepartidorSel("");
      toast.success(`${nombre} eliminado`);
      await cargarResumen();
      setVersionRuta((v) => v + 1);
    } catch {
      toast.error("No se pudo eliminar el repartidor");
    }
  };

  const cambiarAsignacion = async (municipio: string, valor: string) => {
    if (!manifiestoId) return;
    try {
      await asignarRepartidor(manifiestoId, provincia, municipio, valor || null);
      await cargarResumen();
      setVersionRuta((v) => v + 1);
    } catch {
      toast.error("No se pudo guardar la asignación");
    }
  };

  // Asigna de una vez todos los municipios de la provincia al mismo repartidor.
  const asignarTodosAMunicipios = async (nombre: string) => {
    if (!manifiestoId) return;
    setAsignandoTodos(true);
    try {
      const { municipios } = await asignarRepartidorATodos(
        manifiestoId,
        provincia,
        nombre
      );
      toast.success(
        `${municipios.length} municipio(s) asignados a ${nombre}`
      );
      await cargarResumen();
      setVersionRuta((v) => v + 1);
    } catch {
      toast.error("No se pudieron asignar los municipios");
    } finally {
      setAsignandoTodos(false);
    }
  };

  const elegirRepartidorParaTodos = (nombre: string) => {
    if (!manifiestoId || !nombre || !resumen || resumen.municipios.length === 0) {
      return;
    }
    const ajenos = resumen.municipios.filter(
      (municipio) => municipio.repartidor && municipio.repartidor !== nombre
    ).length;
    if (ajenos === 0) {
      void asignarTodosAMunicipios(nombre);
      return;
    }
    setConfirmacion({
      titulo: "Confirmar asignación de municipios",
      mensaje: (
        <>
          Se asignarán <b>{resumen.municipios.length}</b> municipios a{" "}
          <b>{nombre}</b>. {ajenos === 1
            ? "1 ya tiene otro repartidor y cambiará de dueño."
            : `${ajenos} ya tienen otro repartidor y cambiarán de dueño.`}{" "}
          ¿Continuar?
        </>
      ),
      accion: "Asignar todos",
      alConfirmar: () => void asignarTodosAMunicipios(nombre),
    });
  };

  const prepararCoordenadasDeProvincia = async () => {
    if (!manifiestoId) return;
    setGeocodificando(true);
    setProgreso(null);
    let consultadas = 0;
    let anterior = Number.POSITIVE_INFINITY;
    try {
      for (let vuelta = 0; vuelta < 80; vuelta++) {
        const avance = await prepararCoordenadas(manifiestoId, provincia, 20);
        setProgreso(avance);
        consultadas += avance.procesadas;

        // Si no quedan pendientes, o el lote no avanza (direcciones que el
        // mapa no encuentra), se corta en vez de repetir en bucle.
        if (avance.pendientes === 0) break;
        if (avance.pendientes >= anterior) break;
        anterior = avance.pendientes;
      }
      toast.success(
        consultadas > 0
          ? `Coordenadas preparadas (${consultadas} direcciones consultadas)`
          : "No había direcciones pendientes"
      );
      await cargarResumen();
      setVersionRuta((v) => v + 1);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.detail || "No se pudieron preparar las coordenadas"
      );
    } finally {
      setGeocodificando(false);
    }
  };

  const exportarRuta = async () => {
    if (!manifiestoId || !repartidorSel) return;
    setExportandoRuta(true);
    try {
      await descargarRutaRepartidorExcel(
        manifiestoId,
        repartidorSel,
        provincia,
        soloPendientes
      );
    } catch {
      toast.error("No se pudo exportar la ruta");
    } finally {
      setExportandoRuta(false);
    }
  };

  const cambiarSalida = async (valor: string) => {
    if (!manifiestoId || !repartidorSel) return;
    try {
      await asignarSalidaRuta(
        manifiestoId,
        provincia,
        repartidorSel,
        valor ? Number(valor) : null
      );
      setVersionRuta((v) => v + 1);
    } catch {
      toast.error("No se pudo cambiar el punto de salida");
    }
  };

  const buscarBase = async () => {
    if (!nuevaBase) return;
    if (!nuevaBase.direccion.trim()) {
      setErrorBase("Escribe la dirección de la base");
      return;
    }
    setBuscandoBase(true);
    setErrorBase(null);
    setResultadosBase([]);
    setRespaldoBase(false);
    setResultadoSel(null);
    try {
      const { resultados, respaldo, mensaje } = await buscarPuntoPartida(
        nuevaBase.direccion,
        "",
        provincia
      );
      setResultadosBase(resultados);
      setRespaldoBase(respaldo);
      if (resultados.length === 0) {
        setErrorBase(
          mensaje ||
            "El mapa no encontró esa dirección. Puedes escribir las coordenadas a mano."
        );
      }
    } catch (err: any) {
      setErrorBase(
        err?.response?.data?.detail ||
          "No se pudo consultar el mapa. Comprueba la conexión y vuelve a intentarlo."
      );
    } finally {
      setBuscandoBase(false);
    }
  };

  // El operador elige el lugar correcto de la lista; hasta que elija, las
  // coordenadas no se tocan.
  const elegirResultado = (lugar: ResultadoLugar, indice: number) => {
    setResultadoSel(indice);
    setErrorBase(null);
    setNuevaBase((actual) =>
      actual
        ? { ...actual, lat: lugar.lat.toFixed(6), lon: lugar.lon.toFixed(6) }
        : actual
    );
  };

  // Crea la base y la deja como salida del repartidor.
  const crearBase = async (nombre: string, lat: number, lon: number) => {
    if (!nuevaBase || !manifiestoId || !repartidorSel) return;
    setGuardandoBase(true);
    try {
      const { puntos: actualizados, id } = await crearPuntoPartida({
        nombre,
        direccion: nuevaBase.direccion.trim(),
        lat,
        lon,
      });
      setPuntos(actualizados);
      await asignarSalidaRuta(manifiestoId, provincia, repartidorSel, id);
      setNuevaBase(null);
      setResultadosBase([]);
      setRespaldoBase(false);
      setResultadoSel(null);
      setErrorBase(null);
      setConfirmacion(null);
      setVersionRuta((v) => v + 1);
      toast.success(`${repartidorSel} sale de ${nombre}`);
    } catch (err: any) {
      setErrorBase(err?.response?.data?.detail || "No se pudo guardar la base");
    } finally {
      setGuardandoBase(false);
    }
  };

  const guardarBase = async () => {
    if (!nuevaBase || !manifiestoId || !repartidorSel) return;
    const nombre = nuevaBase.nombre.trim();
    const lat = Number(nuevaBase.lat.replace(",", "."));
    const lon = Number(nuevaBase.lon.replace(",", "."));
    if (!nombre) {
      setErrorBase("Ponle un nombre a la base");
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      setErrorBase("Escribe la latitud y la longitud de la base");
      return;
    }
    // Si el lugar elegido está en otra provincia, se confirma con el mismo
    // modal que usa el resto de la app antes de crear la base.
    const fueraDeProvincia =
      resultadoSel !== null ? resultadosBase[resultadoSel] : null;
    if (fueraDeProvincia?.misma_provincia === false) {
      const provinciaLugar = fueraDeProvincia.provincia || "otra provincia";
      setConfirmacion({
        titulo: "Confirmar base en otra provincia",
        mensaje: (
          <>
            El lugar elegido está en <b>{provinciaLugar}</b>, no en{" "}
            <b>{provincia}</b>. Si guardas la base ahí, la ruta saldrá de otra
            provincia. ¿Guardar de todas formas?
          </>
        ),
        accion: "Guardar de todas formas",
        alConfirmar: () => void crearBase(nombre, lat, lon),
        alCancelar: () =>
          setErrorBase(
            `No se guardó la base: el lugar está en ${provinciaLugar}, no en ${provincia}. Elige otro resultado.`
          ),
      });
      return;
    }
    await crearBase(nombre, lat, lon);
  };

  const borrarBase = (puntoId: number) => {
    const base = puntos.find((punto) => punto.id === puntoId);
    if (!base) return;
    setConfirmacion({
      titulo: "Confirmar eliminación de la base",
      mensaje: (
        <>
          ¿Eliminar la base <b>{base.nombre}</b>? Los repartidores que salían de
          ella pasarán a la cabecera provincial.
        </>
      ),
      accion: "Eliminar",
      peligro: true,
      alConfirmar: () => void eliminarBaseConfirmada(puntoId),
    });
  };

  const eliminarBaseConfirmada = async (puntoId: number) => {
    try {
      setPuntos(await eliminarPuntoPartida(puntoId));
      setVersionRuta((v) => v + 1);
      toast.success("Base eliminada");
    } catch {
      toast.error("No se pudo eliminar la base");
    }
  };

  const abrirCorreccion = (parada: ParadaRuta) => {
    setCorreccion({
      parada,
      direccion: parada.direccion,
      lat: parada.lat != null ? String(parada.lat) : "",
      lon: parada.lon != null ? String(parada.lon) : "",
      corregida: parada.precision === "manual",
    });
  };

  const buscarEnMapa = async () => {
    if (!correccion) return;
    setBuscandoCoordenadas(true);
    try {
      const { lat, lon } = await buscarUbicacionParada(
        correccion.direccion,
        correccion.parada.municipio,
        provincia
      );
      if (lat == null || lon == null) {
        toast.error(
          "El mapa no encontró esa dirección. Puedes escribir las coordenadas a mano."
        );
        return;
      }
      setCorreccion((actual) =>
        actual ? { ...actual, lat: String(lat), lon: String(lon) } : actual
      );
      toast.success("Coordenadas encontradas");
    } catch {
      toast.error("No se pudo consultar el mapa");
    } finally {
      setBuscandoCoordenadas(false);
    }
  };

  const guardarCorreccion = async () => {
    if (!correccion) return;
    const lat = Number(correccion.lat.replace(",", "."));
    const lon = Number(correccion.lon.replace(",", "."));
    if (
      !correccion.lat.trim() ||
      !correccion.lon.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon)
    ) {
      toast.error("Escribe la latitud y la longitud de la parada");
      return;
    }

    setGuardandoCorreccion(true);
    try {
      await corregirUbicacionParada({
        provincia,
        municipio: correccion.parada.municipio,
        direccion: correccion.parada.direccion_original,
        direccion_corregida: correccion.direccion.trim() || undefined,
        lat,
        lon,
      });
      toast.success("Ubicación corregida");
      setCorreccion(null);
      await cargarResumen();
      setVersionRuta((v) => v + 1);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.detail || "No se pudo guardar la corrección"
      );
    } finally {
      setGuardandoCorreccion(false);
    }
  };

  const descartarCorreccion = async () => {
    if (!correccion) return;
    setGuardandoCorreccion(true);
    try {
      await quitarCorreccionParada(
        provincia,
        correccion.parada.municipio,
        correccion.parada.direccion_original
      );
      toast.success("Corrección eliminada");
      setCorreccion(null);
      await cargarResumen();
      setVersionRuta((v) => v + 1);
    } catch {
      toast.error("No se pudo quitar la corrección");
    } finally {
      setGuardandoCorreccion(false);
    }
  };

  if (!metadata || !manifiestoId) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="w-full">
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Truck className="mx-auto h-12 w-12 text-slate-300" />
            <h1 className="mt-4 text-xl font-bold text-slate-900">
              Aún no hay manifiesto
            </h1>
            <p className="mt-2 text-slate-600">
              Elige o sube un manifiesto para preparar las rutas de reparto.
            </p>
            <Link
              href="/manifiestos"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-medium text-white transition-colors hover:bg-primary/90"
            >
              <Upload className="h-4 w-4" /> Ir a Manifiestos
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const paradasSinUbicar = ruta?.sin_ubicar ?? 0;
  const pendientesGeocodificar = resumen?.pendientes_geocodificar ?? 0;

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
              <Route className="h-7 w-7 text-primary" />
              Rutas de reparto
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              El orden de visita más corto para cada repartidor en la provincia
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-slate-700" htmlFor="provincia-ruta">
              Provincia
            </label>
            <select
              id="provincia-ruta"
              value={provincia}
              onChange={(evento) => {
                setProvincia(evento.target.value);
                setRepartidorSel("");
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none"
            >
              {provincias.map((nombre) => (
                <option key={nombre} value={nombre}>
                  {nombre}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={soloPendientes}
                onChange={(evento) => setSoloPendientes(evento.target.checked)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Ocultar entregadas
            </label>
          </div>
        </div>

        {cargando && !resumen && (
          <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Calculando paradas...
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle className="h-5 w-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {resumen && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            {/* Equipo y reparto de municipios */}
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                  <Truck className="h-5 w-5 text-primary" /> Repartidores
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Se dan de alta una vez y sirven para todos los manifiestos.
                </p>

                {isAdmin && (
                  <form onSubmit={agregarRepartidor} className="mt-4 flex gap-2">
                    <input
                      value={nuevoRepartidor}
                      onChange={(evento) => setNuevoRepartidor(evento.target.value)}
                      placeholder="Nombre del repartidor"
                      className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                    >
                      <Plus className="h-4 w-4" /> Añadir
                    </button>
                  </form>
                )}

                {repartidores.length === 0 ? (
                  <p className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-500">
                    Todavía no hay repartidores.{" "}
                    {isAdmin ? "Añade el primero arriba." : "Pide a un administrador que los cree."}
                  </p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {repartidores.map((nombre) => {
                      const datos = resumen.repartidores.find((r) => r.nombre === nombre);
                      const activo = repartidorSel === nombre;
                      return (
                        <li key={nombre}>
                          <div
                            className={`flex items-center gap-2 rounded-lg border p-2 ${
                              activo ? "border-primary/40 bg-primary/5" : "border-slate-200"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setRepartidorSel(nombre)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="truncate text-sm font-medium text-slate-900">
                                {nombre}
                              </div>
                              <div className="text-xs text-slate-500">
                                {datos?.municipios.length ?? 0} municipio(s) ·{" "}
                                {datos?.paradas ?? 0} parada(s)
                              </div>
                            </button>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={() => borrarRepartidor(nombre)}
                                className="rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                                aria-label={`Eliminar ${nombre}`}
                                title="Eliminar repartidor"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-6 pb-4">
                  <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
                    <MapPin className="h-5 w-5 text-primary" /> Municipios
                  </h2>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-slate-500">
                      {resumen.total_paradas} paradas · {resumen.total_bultos} bultos
                    </span>
                    {isAdmin && repartidores.length > 0 && (
                      <label className="flex items-center gap-2 text-xs text-slate-600">
                        Asignar todos a
                        <select
                          value=""
                          onChange={(evento) =>
                            elegirRepartidorParaTodos(evento.target.value)
                          }
                          disabled={asignandoTodos}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-900 focus:border-primary focus:outline-none disabled:opacity-60"
                        >
                          <option value="">Elegir…</option>
                          {repartidores.map((nombre) => (
                            <option key={nombre} value={nombre}>
                              {nombre}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                </div>
                <div className="max-h-[26rem] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-6 py-2 text-left font-medium">Municipio</th>
                        <th className="px-2 py-2 text-right font-medium">Paradas</th>
                        <th className="px-6 py-2 text-left font-medium">Repartidor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resumen.municipios.map((municipio) => (
                        <tr key={municipio.municipio}>
                          <td className="px-6 py-2">
                            <div className="font-medium text-slate-900">{municipio.municipio}</div>
                            <div className="text-xs text-slate-500">
                              {municipio.ubicadas}/{municipio.paradas} con coordenadas
                            </div>
                          </td>
                          <td className="px-2 py-2 text-right text-slate-600">
                            {municipio.paradas}
                          </td>
                          <td className="px-6 py-2">
                            {isAdmin ? (
                              <select
                                value={municipio.repartidor ?? ""}
                                onChange={(evento) =>
                                  cambiarAsignacion(municipio.municipio, evento.target.value)
                                }
                                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-900 focus:border-primary focus:outline-none"
                              >
                                <option value="">Sin asignar</option>
                                {repartidores.map((nombre) => (
                                  <option key={nombre} value={nombre}>
                                    {nombre}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-xs text-slate-600">
                                {municipio.repartidor ?? "Sin asignar"}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            {/* Ruta calculada */}
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {repartidorSel ? `Ruta de ${repartidorSel}` : "Ruta del repartidor"}
                    </h2>
                    <p className="mt-1 text-xs text-slate-500">
                      {ruta?.origen?.tipo === "base"
                        ? `Arranca en la base de salida ${
                            ruta.origen.etiqueta
                              ? `«${ruta.origen.etiqueta}»`
                              : "del repartidor"
                          }${
                            ruta.origen.direccion
                              ? ` (${ruta.origen.direccion})`
                              : ""
                          } y encadena las paradas más cercanas. Los kilómetros acumulados se cuentan desde ese punto.`
                        : ruta?.origen?.tipo === "primera_parada"
                        ? "No hay base ni cabecera ubicadas: arranca en la primera parada y encadena el resto por cercanía. Los kilómetros acumulados se cuentan desde ese punto."
                        : `Arranca en la cabecera provincial de ${provincia} y encadena las paradas más cercanas. Los kilómetros acumulados se cuentan desde ese punto.`}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                        <Warehouse className="h-3.5 w-3.5" /> Punto de salida
                      </span>
                      <select
                        aria-label="Punto de salida"
                        value={
                          ruta?.origen?.tipo === "base" && ruta.origen.punto_id
                            ? String(ruta.origen.punto_id)
                            : ""
                        }
                        onChange={(evento) => cambiarSalida(evento.target.value)}
                        disabled={!isAdmin || !repartidorSel}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-primary focus:outline-none disabled:opacity-60"
                      >
                        <option value="">Cabecera de {provincia}</option>
                        {puntos.map((punto) => (
                          <option key={punto.id} value={punto.id}>
                            {punto.nombre}
                          </option>
                        ))}
                      </select>
                      {isAdmin && repartidorSel && (
                        <button
                          type="button"
                          onClick={() => {
                            setNuevaBase({
                              nombre: "",
                              direccion: "",
                              lat: "",
                              lon: "",
                            });
                            setResultadosBase([]);
                            setRespaldoBase(false);
                            setResultadoSel(null);
                            setErrorBase(null);
                            setConfirmacion(null);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2 py-1 font-medium text-slate-700 transition-colors hover:bg-slate-50"
                        >
                          <Plus className="h-3.5 w-3.5" /> Nueva base
                        </button>
                      )}
                      {isAdmin && ruta?.origen?.tipo === "base" && ruta.origen.punto_id && (
                        <button
                          type="button"
                          onClick={() => borrarBase(ruta.origen!.punto_id!)}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-medium text-red-600 transition-colors hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Borrar base
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ruta && ruta.paradas.length > 0 && (
                      <button
                        type="button"
                        onClick={exportarRuta}
                        disabled={exportandoRuta}
                        className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                      >
                        {exportandoRuta ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                        Exportar a Excel
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={prepararCoordenadasDeProvincia}
                        disabled={geocodificando}
                        className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                      >
                        {geocodificando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <MapPin className="h-4 w-4" />
                        )}
                        {geocodificando ? "Ubicando direcciones..." : "Preparar coordenadas"}
                      </button>
                    )}
                  </div>
                </div>

                {(pendientesGeocodificar > 0 || (resumen.fallidas ?? 0) > 0) && (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {pendientesGeocodificar > 0
                      ? `${pendientesGeocodificar} dirección(es) sin consultar todavía.`
                      : ""}{" "}
                    {resumen.fallidas > 0
                      ? `${resumen.fallidas} dirección(es) que el mapa no encontró: se ordenan por su municipio.`
                      : ""}
                  </p>
                )}

                {progreso && geocodificando && (
                  <p className="mt-2 text-xs text-slate-500">
                    {progreso.procesadas} consultadas en la última tanda ·{" "}
                    {progreso.pendientes} pendientes
                  </p>
                )}

                {ruta && ruta.paradas.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                      {ruta.total_paradas} paradas
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                      {ruta.total_bultos} bultos
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
                      {ruta.total_peso} kg
                    </span>
                    <span className="rounded-full bg-primary/10 px-3 py-1 font-semibold text-primary">
                      ≈ {ruta.distancia_km} km
                    </span>
                    {ruta.aproximadas > 0 && (
                      <span className="rounded-full bg-amber-100 px-3 py-1 font-medium text-amber-800">
                        {ruta.aproximadas} aproximada(s)
                      </span>
                    )}
                    {paradasSinUbicar > 0 && (
                      <span className="rounded-full bg-red-100 px-3 py-1 font-medium text-red-700">
                        {paradasSinUbicar} sin ubicar
                      </span>
                    )}
                    {resumen.corregidas > 0 && (
                      <span className="rounded-full bg-sky-100 px-3 py-1 font-medium text-sky-800">
                        {resumen.corregidas} corregida(s) a mano
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="p-6">
                {cargandoRuta && (
                  <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" /> Calculando la ruta...
                  </div>
                )}

                {!cargandoRuta && !repartidorSel && (
                  <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                    Asigna municipios a un repartidor para ver su ruta.
                  </div>
                )}

                {!cargandoRuta && repartidorSel && ruta && ruta.paradas.length === 0 && (
                  <div className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500">
                    {ruta.mensaje ?? "Este repartidor no tiene paradas pendientes en la provincia."}
                  </div>
                )}

                {!cargandoRuta && ruta && ruta.paradas.length > 0 && (
                  <ol className="space-y-2">
                    {ruta.paradas.map((parada) => (
                      <li
                        key={parada.clave}
                        className="flex gap-3 rounded-xl border border-slate-200 p-3"
                      >
                        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {parada.orden}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <p className="min-w-0 flex-1 truncate font-medium text-slate-900">
                              {parada.direccion || "Sin dirección"}
                            </p>
                            <span className="flex-shrink-0 whitespace-nowrap text-xs font-medium text-slate-500">
                              {parada.tramo_km != null
                                ? `${parada.tramo_km} km`
                                : "sin ubicar"}
                            </span>
                          </div>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {parada.municipio}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Package className="h-3 w-3" /> {parada.bultos} bultos ·{" "}
                              {parada.hbls.length} HBL
                            </span>
                            {parada.telefono && (
                              <span className="inline-flex items-center gap-1">
                                <Phone className="h-3 w-3" /> {parada.telefono}
                              </span>
                            )}
                          </p>
                          {parada.destinatario && (
                            <p className="mt-0.5 truncate text-xs text-slate-600">
                              {parada.destinatario}
                            </p>
                          )}
                          <div className="mt-1 flex flex-wrap gap-1">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                              {parada.estado}
                            </span>
                            {parada.precision === "municipio" && (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                                Ubicación aproximada
                              </span>
                            )}
                            {parada.precision === "manual" && (
                              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-800">
                                Corregida a mano
                              </span>
                            )}
                            {parada.precision === null && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                                Sin coordenadas
                              </span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => abrirCorreccion(parada)}
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary"
                            aria-label={`Corregir ubicación de ${parada.direccion_original}`}
                            title="Corregir ubicación"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        )}
      </div>

      <Modal
        isOpen={correccion !== null}
        onClose={() => setCorreccion(null)}
        title="Corregir ubicación"
      >
        {correccion && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
              <div className="font-medium text-slate-900">
                {correccion.parada.municipio}
              </div>
              <div>{correccion.parada.direccion_original}</div>
            </div>

            <div>
              <label
                htmlFor="correccion-direccion"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Dirección
              </label>
              <div className="flex gap-2">
                <input
                  id="correccion-direccion"
                  value={correccion.direccion}
                  onChange={(evento) =>
                    setCorreccion((actual) =>
                      actual ? { ...actual, direccion: evento.target.value } : actual
                    )
                  }
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={buscarEnMapa}
                  disabled={buscandoCoordenadas}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  {buscandoCoordenadas ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Buscar
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Se busca en OpenStreetMap usando el municipio y la provincia.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="correccion-lat"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Latitud
                </label>
                <input
                  id="correccion-lat"
                  value={correccion.lat}
                  onChange={(evento) =>
                    setCorreccion((actual) =>
                      actual ? { ...actual, lat: evento.target.value } : actual
                    )
                  }
                  inputMode="decimal"
                  placeholder="22.4136"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="correccion-lon"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Longitud
                </label>
                <input
                  id="correccion-lon"
                  value={correccion.lon}
                  onChange={(evento) =>
                    setCorreccion((actual) =>
                      actual ? { ...actual, lon: evento.target.value } : actual
                    )
                  }
                  inputMode="decimal"
                  placeholder="-83.6880"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              {correccion.corregida ? (
                <button
                  type="button"
                  onClick={descartarCorreccion}
                  disabled={guardandoCorreccion}
                  className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
                >
                  Quitar corrección
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCorreccion(null)}
                  className="rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={guardarCorreccion}
                  disabled={guardandoCorreccion}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
                >
                  {guardandoCorreccion && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={nuevaBase !== null}
        onClose={() => {
          setNuevaBase(null);
          setConfirmacion(null);
        }}
        title="Nueva base de salida"
      >
        {nuevaBase && (
          <div className="space-y-4">
            <div>
              <label
                htmlFor="base-nombre"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Nombre
              </label>
              <input
                id="base-nombre"
                value={nuevaBase.nombre}
                onChange={(evento) => {
                  setNuevaBase((actual) =>
                    actual ? { ...actual, nombre: evento.target.value } : actual
                  );
                  setErrorBase(null);
                }}
                placeholder="Almacén Pinar del Río"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="base-direccion"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Dirección
              </label>
              <div className="flex gap-2">
                <input
                  id="base-direccion"
                  value={nuevaBase.direccion}
                  onChange={(evento) => {
                    setNuevaBase((actual) =>
                      actual ? { ...actual, direccion: evento.target.value } : actual
                    );
                    setResultadosBase([]);
                    setRespaldoBase(false);
                    setResultadoSel(null);
                    setErrorBase(null);
                  }}
                  placeholder="Calle Martí 120, Pinar del Río"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
                <button
                  type="button"
                  onClick={buscarBase}
                  disabled={buscandoBase}
                  className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
                >
                  {buscandoBase ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                  Buscar
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Se busca en OpenStreetMap con la provincia del manifiesto. Elige
                el lugar correcto o escribe las coordenadas a mano.
              </p>

              {errorBase && (
                <p
                  role="alert"
                  className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
                >
                  {errorBase}
                </p>
              )}

              {resultadosBase.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <p className="text-xs font-medium text-slate-600">
                    {respaldoBase
                      ? "No apareció la dirección exacta. Estos son los resultados del municipio:"
                      : `${resultadosBase.length} ${
                          resultadosBase.length === 1 ? "resultado" : "resultados"
                        } del mapa:`}
                  </p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto pr-1">
                    {resultadosBase.map((lugar, indice) => {
                      const elegido = resultadoSel === indice;
                      return (
                        <li key={`${lugar.lat}-${lugar.lon}-${indice}`}>
                          <button
                            type="button"
                            onClick={() => elegirResultado(lugar, indice)}
                            aria-pressed={elegido}
                            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                              elegido
                                ? "border-primary bg-primary/5"
                                : "border-slate-200 hover:bg-slate-50"
                            }`}
                          >
                            <span className="flex items-start gap-2">
                              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="min-w-0 flex-1">
                                <span className="line-clamp-2 block text-xs font-medium text-slate-800">
                                  {lugar.etiqueta}
                                </span>
                                <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                                  <span>
                                    {lugar.lat.toFixed(5)}, {lugar.lon.toFixed(5)}
                                  </span>
                                  {lugar.aproximado && (
                                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                                      Aproximado
                                    </span>
                                  )}
                                  {lugar.misma_provincia === false && (
                                    <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                                      Otra provincia
                                    </span>
                                  )}
                                  {elegido && (
                                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                                      Elegido
                                    </span>
                                  )}
                                </span>
                              </span>
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  {resultadoSel !== null &&
                    resultadosBase[resultadoSel]?.aproximado && (
                      <p className="text-[11px] text-amber-700">
                        Es el centro del municipio, no la dirección exacta: la ruta
                        saldrá de ahí.
                      </p>
                    )}
                  {resultadoSel !== null &&
                    resultadosBase[resultadoSel]?.misma_provincia === false && (
                      <p
                        role="alert"
                        className="rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800"
                      >
                        Ese lugar está en {resultadosBase[resultadoSel].provincia},
                        no en {provincia}: la ruta saldría de otra provincia. Al
                        guardar se te pedirá confirmación.
                      </p>
                    )}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="base-lat"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Latitud
                </label>
                <input
                  id="base-lat"
                  value={nuevaBase.lat}
                  onChange={(evento) => {
                    setNuevaBase((actual) =>
                      actual ? { ...actual, lat: evento.target.value } : actual
                    );
                    // Con coordenadas a mano el lugar elegido ya no manda.
                    setResultadoSel(null);
                  }}
                  inputMode="decimal"
                  placeholder="22.4136"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label
                  htmlFor="base-lon"
                  className="mb-1 block text-sm font-medium text-slate-700"
                >
                  Longitud
                </label>
                <input
                  id="base-lon"
                  value={nuevaBase.lon}
                  onChange={(evento) => {
                    setNuevaBase((actual) =>
                      actual ? { ...actual, lon: evento.target.value } : actual
                    );
                    // Con coordenadas a mano el lugar elegido ya no manda.
                    setResultadoSel(null);
                  }}
                  inputMode="decimal"
                  placeholder="-83.6880"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setNuevaBase(null);
                  setConfirmacion(null);
                }}
                className="rounded-lg px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarBase}
                disabled={guardandoBase}
                className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {guardandoBase && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={confirmacion !== null}
        onClose={() => setConfirmacion(null)}
        title={confirmacion?.titulo ?? "Confirmar"}
      >
        <p className="mb-6 text-slate-600">{confirmacion?.mensaje}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              const cancelar = confirmacion?.alCancelar;
              setConfirmacion(null);
              cancelar?.();
            }}
            className="rounded-lg px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-100"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              const accion = confirmacion?.alConfirmar;
              setConfirmacion(null);
              accion?.();
            }}
            className={`rounded-lg px-4 py-2 font-medium text-white transition-colors ${
              confirmacion?.peligro
                ? "bg-red-600 hover:bg-red-700"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            {confirmacion?.accion}
          </button>
        </div>
      </Modal>
    </main>
  );
}
