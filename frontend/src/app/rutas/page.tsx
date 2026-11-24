"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Cookies from "js-cookie";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Package,
  Phone,
  Plus,
  Route,
  Trash2,
  Truck,
  Upload,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { ORDEN_PROVINCIAS } from "@/lib/provincias";
import {
  asignarRepartidor,
  crearRepartidor,
  eliminarRepartidor,
  obtenerRepartidores,
  obtenerResumenRutas,
  obtenerRutaRepartidor,
  prepararCoordenadas,
  type ProgresoGeocodificacion,
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
  const [nuevoRepartidor, setNuevoRepartidor] = useState("");
  const [repartidorSel, setRepartidorSel] = useState("");
  const [ruta, setRuta] = useState<RutaRepartidor | null>(null);
  const [cargandoRuta, setCargandoRuta] = useState(false);
  const [soloPendientes, setSoloPendientes] = useState(true);
  const [geocodificando, setGeocodificando] = useState(false);
  const [progreso, setProgreso] = useState<ProgresoGeocodificacion | null>(null);
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
      const [datos, nombres] = await Promise.all([
        obtenerResumenRutas(manifiestoId, provincia),
        obtenerRepartidores(),
      ]);
      setResumen(datos);
      setRepartidores(nombres);
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

  const borrarRepartidor = async (nombre: string) => {
    const confirmado = window.confirm(
      `¿Eliminar a ${nombre}? Sus municipios quedarán sin asignar.`
    );
    if (!confirmado) return;
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
                  <span className="text-xs text-slate-500">
                    {resumen.total_paradas} paradas · {resumen.total_bultos} bultos
                  </span>
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
                      Empieza en la cabecera de {provincia} y encadena las paradas más cercanas.
                    </p>
                  </div>
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
                            <p className="truncate font-medium text-slate-900">
                              {parada.direccion || "Sin dirección"}
                            </p>
                            <span className="text-xs font-medium text-slate-500">
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
                            {parada.precision === null && (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">
                                Sin coordenadas
                              </span>
                            )}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
