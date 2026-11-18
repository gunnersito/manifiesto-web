import ordenProvincias from "../../../orden-provincias.json";

/**
 * Orden geográfico de provincias (oeste → este) en el formato en que llegan los
 * manifiestos: mayúsculas y sin tildes.
 *
 * La lista canónica vive en `orden-provincias.json` (raíz del repo) y la
 * comparten el backend (app.core.config) y el frontend.
 */
export const ORDEN_PROVINCIAS: string[] = ordenProvincias.map((provincia) =>
  provincia
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
);
