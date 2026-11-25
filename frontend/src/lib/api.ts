import axios from "axios";

// Las peticiones van a /api del propio origen: next.config.ts reenvía esa ruta
// a la API (variable API_URL). Al ser same-origin no hace falta CORS y la
// cookie de sesión funciona con SameSite=Lax.
export const API_URL = "/api";

// 2. Creamos la instancia
export const api = axios.create({
  baseURL: API_URL,
  // La sesión viaja en una cookie httpOnly emitida por el backend: el navegador
  // la adjunta sola y el token nunca pasa por JavaScript.
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

// --- Tipos de datos que devuelve el backend ---
// --- Funciones de la API ---
export async function subirManifiesto(
    file: File,
    hoja?: string,
    umbral: number = 0.9
): Promise<any> { 
  const formData = new FormData();
  formData.append("file", file);
  if (hoja) formData.append("hoja", hoja);
  formData.append("umbral", umbral.toString());
  const response = await api.post("/manifiestos/guardar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export interface ParadaInfo {
  Parada: number;
  Destinatario: string;
  "Dirección": string;
  Municipio: string;
  "Cant HBLs": number;
  Bultos: number;
  "Peso (Kg)": number;
  Estado?: string;
}

export interface ParadasResponse {
  provincia: string;
  total_paradas: number;
  total_hbls: number;
  total_hbls_sin_filtro?: number;
  paradas: ParadaInfo[];
}

export async function actualizarEstado(
  hbl: string,
  estado: string
): Promise<{ status: string; hbl: string; estado: string }> {
  const response = await api.post("/manifiestos/estado", { hbl, estado });
  return response.data;
}

export async function actualizarEstadosMasivos(
  hbls: string[],
  estado: string
): Promise<{ status: string; hbls_actualizados: number; estado: string }> {
  const response = await api.post("/manifiestos/estados-masivos", {
    hbls,
    estado,
  });
  return response.data;
}

export interface CambioEstado {
  estado: string;
  usuario: string;
  fecha_hora: string;
}

// Cambios de estado de un HBL, del más reciente al más antiguo.
export async function obtenerHistorial(
  hbl: string,
  limite: number = 50
): Promise<CambioEstado[]> {
  const response = await api.get(
    `/manifiestos/historial/${encodeURIComponent(hbl)}?limite=${limite}`
  );
  return response.data.historial;
}

// ============================================================
// MANIFIESTOS PERSISTIDOS
// ============================================================
export interface ManifiestoResumen {
  provincia: string;
  hbls: number;
  paradas: number;
  bultos: number;
  municipios?: string[];
}

export interface ManifiestoMetadata {
  id: number;
  nombre_archivo: string;
  fecha_subida: string;
  total_filas: number;
  total_provincias: number;
  total_paradas: number;
  total_bultos: number;
  resumen: ManifiestoResumen[];
}

export interface ManifiestoEnLista {
  id: number;
  nombre_archivo: string;
  fecha_subida: string;
  total_filas: number;
  total_provincias: number;
  total_paradas: number;
  total_bultos: number;
}

export interface HBLRegistro {
  id: number;
  hbl: string;
  provincia: string;
  municipio: string;
  direccion: string;
  remitente: string;
  destinatario: string;
  telefono: string;
  contenido: string;
  bultos: number;
  peso: number;
  parada: number;
  estado: string;
}

export interface HBLsPaginaResponse {
  total: number;
  pagina: number;
  por_pagina: number;
  total_paginas: number;
  hbls: HBLRegistro[];
}

export interface GuardarManifiestoResponse {
  status: "success" | "already_exists";
  manifiesto_id: number;
  total_filas: number;
  provincias: ManifiestoResumen[];
  mensaje?: string;
}

export async function guardarManifiesto(
  file: File,
  umbral: number = 0.9
): Promise<GuardarManifiestoResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("umbral", umbral.toString());

  const response = await api.post<GuardarManifiestoResponse>("/manifiestos/guardar", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export async function listarManifiestos(): Promise<ManifiestoEnLista[]> {
  const response = await api.get("/manifiestos/lista");
  return response.data.manifiestos;
}

export async function obtenerManifiesto(
  id: number
): Promise<ManifiestoMetadata> {
  const response = await api.get(`/manifiestos/${id}`);
  return response.data;
}

// La API rechaza más de 200 HBLs por página. Para traer un grupo entero hay
// que recorrer las páginas, como hace obtenerTodosLosHBLsFiltrados.
const MAX_POR_PAGINA = 200;

function limitarPorPagina(porPagina: number): number {
  return Math.min(Math.max(1, Math.trunc(porPagina) || 1), MAX_POR_PAGINA);
}

export async function obtenerHBLsManifiesto(
  id: number,
  pagina: number = 1,
  por_pagina: number = 15,
  busqueda: string = "",
  estado: string = "",
  provincia: string = "",
  municipio: string = "",
  direccion: string = ""
): Promise<HBLsPaginaResponse> {
  const params = new URLSearchParams({
    pagina: pagina.toString(),
    por_pagina: limitarPorPagina(por_pagina).toString(),
    busqueda,
    estado,
    provincia,
    municipio,
    direccion,
  });
  const response = await api.get(`/manifiestos/${id}/hbls?${params.toString()}`);
  return response.data;
}

// El listado tiene un tope de 200 por página, así que se pide por páginas
// hasta tener todos los HBLs que coinciden con el filtro.
export async function obtenerTodosLosHBLsFiltrados(
  id: number,
  filtros: {
    busqueda?: string;
    estado?: string;
    provincia?: string;
    municipio?: string;
    direccion?: string;
  } = {}
): Promise<HBLRegistro[]> {
  const todos: HBLRegistro[] = [];
  for (let pagina = 1; ; pagina++) {
    const datos = await obtenerHBLsManifiesto(
      id,
      pagina,
      200,
      filtros.busqueda || "",
      filtros.estado || "",
      filtros.provincia || "",
      filtros.municipio || "",
      filtros.direccion || ""
    );
    todos.push(...datos.hbls);
    if (pagina >= datos.total_paginas || datos.hbls.length === 0) break;
  }
  return todos;
}

export async function obtenerTodosLosHBLs(
  manifiestoId: number | null = null,
  pagina: number = 1,
  por_pagina: number = 15,
  busqueda: string = "",
  estado: string = "",
  provincia: string = ""
): Promise<HBLsPaginaResponse> {
  const params = new URLSearchParams({
    pagina: pagina.toString(),
    por_pagina: limitarPorPagina(por_pagina).toString(),
    manifiesto_id: (manifiestoId || 0).toString(), // 👈 Siempre enviamos un número
  });

  if (busqueda) params.append("busqueda", busqueda);
  if (estado) params.append("estado", estado);
  if (provincia) params.append("provincia", provincia);

  const response = await api.get(`/manifiestos/hbls?${params.toString()}`);
  return response.data;
}

export async function eliminarManifiesto(id: number): Promise<void> {
  await api.delete(`/manifiestos/${id}`);
}


// ============================================================
// EXPORTACIONES POR ID
// ============================================================
async function descargarArchivoPorId(
  url: string,
  nombreBase: string,
  prefijo: string
): Promise<void> {
  const response = await api.post(url, {}, {
    responseType: "blob",
    timeout: 120000
  });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const nombreLimpio = nombreBase.replace(/\.xlsx?$/i, "");

  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = `${prefijo}_${nombreLimpio}.xlsx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(link.href);
}

export async function exportarProvinciaPorId(
  manifiestoId: number,
  provincia: string,
  nombreBase: string = ""
): Promise<void> {
  const url = `/manifiestos/exportar-por-id/${manifiestoId}/${encodeURIComponent(provincia)}`;
  await descargarArchivoPorId(url, nombreBase || provincia, "manifiesto");
}

export async function exportarHojaRutaPorId(
  manifiestoId: number,
  provincia: string,
  nombreBase: string = ""
): Promise<void> {
  const url = `/manifiestos/exportar-ruta-por-id/${manifiestoId}/${encodeURIComponent(provincia)}`;
  await descargarArchivoPorId(url, nombreBase || provincia, "ruta");
}

export async function exportarPorMunicipiosPorId(
  manifiestoId: number,
  provincia: string,
  nombreBase: string = ""
): Promise<void> {
  const url = `/manifiestos/exportar-municipios-por-id/${manifiestoId}/${encodeURIComponent(provincia)}`;
  await descargarArchivoPorId(url, nombreBase || provincia, "municipios");
}

export async function exportarTodasProvinciasPorId(
  manifiestoId: number,
  nombreBase: string = ""
): Promise<void> {
  const url = `/manifiestos/exportar-todas-por-id/${manifiestoId}`;
  const nombreFinal = nombreBase ? nombreBase.replace(".xlsx", "").replace(".xls", "") : String(manifiestoId);
  await descargarArchivoPorId(url, nombreFinal, "manifiesto_todas_provincias");
}


export async function obtenerProvinciaPorId(
  manifiestoId: number,
  provincia: string,
  busqueda: string = "",
  estado: string = "",
  ubicacion: string = ""
): Promise<ParadasResponse> {
  const formData = new FormData();
  formData.append("busqueda", busqueda);
  formData.append("estado", estado);
  formData.append("ubicacion", ubicacion);

  const url = `/manifiestos/${manifiestoId}/provincia/${encodeURIComponent(provincia)}`;
  const response = await api.post<ParadasResponse>(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}


export async function compararManifiestos(
  fileGeneral: File,
  fileVentas: File
): Promise<{ manifiesto_id: number; total_filas: number }> {
  const formData = new FormData();
  formData.append("file_general", fileGeneral);
  formData.append("file_ventas", fileVentas);

  const response = await api.post("/manifiestos/comparar-manifiestos", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });

  return response.data;
}


import Cookies from "js-cookie";

// La cookie `sesion` no lleva el token (ese es httpOnly): solo le dice al
// middleware que hay una sesión abierta. Las demás son datos de interfaz.
export function limpiarSesion() {
  Cookies.remove("sesion");
  // Cookie antigua de cuando el token vivía en JavaScript.
  Cookies.remove("token");
  Cookies.remove("role");
  Cookies.remove("username");
  if (typeof window !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    localStorage.removeItem("manifiesto_id");
  }
}

// Si el token caduca o deja de ser válido, la API responde 401. En vez de dejar
// las páginas con errores sueltos, se limpia la sesión y se vuelve al login.
// El propio /auth/login responde 401 con la contraseña incorrecta, así que se
// excluye para que el formulario pueda mostrar su mensaje.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const esLogin = String(error.config?.url || "").includes("/auth/login");
    if (
      error.response?.status === 401 &&
      !esLogin &&
      typeof window !== "undefined"
    ) {
      limpiarSesion();
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

export async function loginRequest(username: string, password: string) {
  const response = await api.post("/auth/login", { username, password });
  // El token lo guarda el backend en su cookie httpOnly; aquí solo se marca la
  // sesión (para el middleware) y los datos que muestran las pantallas.
  Cookies.set("sesion", "1", { expires: 7, sameSite: "lax" });
  // Cookie antigua de cuando el token vivía en JavaScript: se borra al entrar.
  Cookies.remove("token");
  Cookies.set("role", response.data.role, { expires: 7 });
  Cookies.set("username", response.data.username, { expires: 7 });
  return response.data;
}

export async function logoutRequest() {
  try {
    // La cookie httpOnly solo la puede borrar el backend.
    await api.post("/auth/logout");
  } catch {
    // Aunque la API falle, la sesión local se cierra igual.
  }
  limpiarSesion();
  window.location.href = "/login";
}

export interface UsuarioSistema {
  username: string;
  role: string;
}

export const obtenerUsuarios = async () => {
  // Con la barra final: la ruta del backend es "/usuarios/", y sin ella el
  // servidor responde 307 y el navegador no llega a cargar el listado.
  const res = await api.get('/usuarios/');
  return res.data;
};

export const crearUsuario = async (data: any) => {
  const res = await api.post('/usuarios', data);
  return res.data;
};

export const eliminarUsuario = async (username: string) => {
  const res = await api.delete(`/usuarios/${username}`);
  return res.data;
};

export const actualizarUsuario = async (username: string, data: { password?: string, role?: string }) => {
  const res = await api.put(`/usuarios/${username}`, data);
  return res.data;
};

export async function buscarParadasPorMunicipio(manifiestoId: number, municipio: string): Promise<{ paradas: any[] }> {
  const formData = new FormData();
  formData.append("manifiesto_id", manifiestoId.toString());

  const response = await api.post(`/manifiestos/buscar-por-municipio/${encodeURIComponent(municipio)}`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

// ============================================================
// RUTAS DE REPARTO
// ============================================================
export interface MunicipioRuta {
  municipio: string;
  paradas: number;
  bultos: number;
  ubicadas: number;
  repartidor: string | null;
}

export interface RepartidorRuta {
  nombre: string;
  municipios: string[];
  paradas: number;
  bultos: number;
}

export interface ResumenRutas {
  provincia: string;
  municipios: MunicipioRuta[];
  repartidores: RepartidorRuta[];
  total_paradas: number;
  total_bultos: number;
  pendientes_geocodificar: number;
  fallidas: number;
  corregidas: number;
}

export interface ParadaRuta {
  clave: string;
  orden: number;
  municipio: string;
  direccion: string;
  // Dirección tal y como viene en el manifiesto, aunque se haya corregido.
  direccion_original: string;
  destinatario: string;
  telefono: string;
  hbls: string[];
  bultos: number;
  peso: number;
  estado: string;
  lat: number | null;
  lon: number | null;
  precision: "direccion" | "municipio" | "manual" | null;
  tramo_km: number | null;
}

export interface PuntoPartida {
  id: number;
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
}

// Un lugar que devuelve el mapa al buscar la base de salida. `aproximado`
// indica que el punto es el centro de un municipio, no la dirección exacta;
// `misma_provincia` avisa si el lugar cae fuera de la provincia del manifiesto
// (null cuando el mapa no dice la provincia del resultado).
export interface ResultadoLugar {
  lat: number;
  lon: number;
  etiqueta: string;
  aproximado: boolean;
  provincia: string | null;
  misma_provincia: boolean | null;
}

export interface BusquedaPuntosPartida {
  resultados: ResultadoLugar[];
  respaldo: boolean;
  mensaje: string | null;
}

// De dónde arranca la ruta: una base del catálogo, la cabecera provincial o,
// si no hay coordenadas, la primera parada.
export type TipoOrigenRuta = "base" | "cabecera" | "primera_parada";

export interface OrigenRuta {
  lat: number | null;
  lon: number | null;
  etiqueta: string | null;
  tipo: TipoOrigenRuta;
  punto_id: number | null;
  direccion: string;
}

export interface RutaRepartidor {
  repartidor: string;
  provincia: string;
  municipios?: string[];
  origen?: OrigenRuta | null;
  paradas: ParadaRuta[];
  distancia_km: number;
  total_paradas: number;
  total_bultos: number;
  total_peso: number;
  sin_ubicar: number;
  aproximadas: number;
  mensaje?: string | null;
}

export interface ProgresoGeocodificacion {
  provincia: string;
  procesadas: number;
  ubicadas: number;
  aproximadas: number;
  fallidas: number;
  pendientes_antes: number;
  pendientes: number;
}

export async function obtenerResumenRutas(
  manifiestoId: number,
  provincia: string
): Promise<ResumenRutas> {
  const params = new URLSearchParams({ provincia });
  const response = await api.get(`/rutas/${manifiestoId}?${params.toString()}`);
  return response.data;
}

export async function obtenerRutaRepartidor(
  manifiestoId: number,
  nombre: string,
  provincia: string,
  soloPendientes: boolean = true
): Promise<RutaRepartidor> {
  const params = new URLSearchParams({
    provincia,
    solo_pendientes: String(soloPendientes),
  });
  const response = await api.get(
    `/rutas/${manifiestoId}/repartidor/${encodeURIComponent(nombre)}?${params.toString()}`
  );
  return response.data;
}

export async function prepararCoordenadas(
  manifiestoId: number,
  provincia: string,
  limite: number = 20
): Promise<ProgresoGeocodificacion> {
  const params = new URLSearchParams({ provincia, limite: String(limite) });
  const response = await api.post(
    `/rutas/${manifiestoId}/geocodificar?${params.toString()}`,
    {},
    { timeout: 180000 }
  );
  return response.data;
}

export async function obtenerRepartidores(): Promise<string[]> {
  const response = await api.get("/rutas/repartidores");
  return response.data.repartidores;
}

export async function crearRepartidor(nombre: string): Promise<string[]> {
  const response = await api.post("/rutas/repartidores", { nombre });
  return response.data.repartidores;
}

export async function eliminarRepartidor(nombre: string): Promise<string[]> {
  const response = await api.delete(
    `/rutas/repartidores/${encodeURIComponent(nombre)}`
  );
  return response.data.repartidores;
}

export async function asignarRepartidor(
  manifiestoId: number,
  provincia: string,
  municipio: string,
  repartidor: string | null
): Promise<void> {
  await api.put("/rutas/asignaciones", {
    manifiesto_id: manifiestoId,
    provincia,
    municipio,
    repartidor,
  });
}


// Asigna todos los municipios de la provincia a un mismo repartidor.
export async function asignarRepartidorATodos(
  manifiestoId: number,
  provincia: string,
  repartidor: string
): Promise<{ repartidor: string; municipios: string[] }> {
  const response = await api.put("/rutas/asignaciones/todos", {
    manifiesto_id: manifiestoId,
    provincia,
    repartidor,
  });
  return response.data;
}


// Descarga la ruta de un repartidor en Excel, en el mismo orden que la pantalla.
export async function descargarRutaRepartidorExcel(
  manifiestoId: number,
  nombre: string,
  provincia: string,
  soloPendientes: boolean = true
): Promise<void> {
  const params = new URLSearchParams({
    provincia,
    solo_pendientes: String(soloPendientes),
  });
  const response = await api.get(
    `/rutas/${manifiestoId}/repartidor/${encodeURIComponent(nombre)}/excel?${params.toString()}`,
    { responseType: "blob", timeout: 120000 }
  );

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = `ruta_${nombre}_${provincia}.xlsx`.replace(/[^\w.\-]+/g, "_");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(link.href);
}


// ============================================================
// CORRECCIONES A MANO DE LA UBICACIÓN
// ============================================================
export async function corregirUbicacionParada(datos: {
  provincia: string;
  municipio: string;
  direccion: string;
  direccion_corregida?: string;
  lat: number;
  lon: number;
}): Promise<void> {
  await api.put("/rutas/paradas/correccion", datos);
}

export async function quitarCorreccionParada(
  provincia: string,
  municipio: string,
  direccion: string
): Promise<void> {
  const params = new URLSearchParams({ provincia, municipio, direccion });
  await api.delete(`/rutas/paradas/correccion?${params.toString()}`);
}

export async function buscarUbicacionParada(
  direccion: string,
  municipio: string,
  provincia: string
): Promise<{ lat: number | null; lon: number | null }> {
  const response = await api.post(
    "/rutas/paradas/buscar",
    { direccion, municipio, provincia },
    { timeout: 60000 }
  );
  return response.data;
}


// ============================================================
// PUNTOS DE PARTIDA (BASES DE SALIDA)
// ============================================================
export async function obtenerPuntosPartida(): Promise<PuntoPartida[]> {
  const response = await api.get("/rutas/puntos-partida");
  return response.data.puntos;
}

export async function crearPuntoPartida(datos: {
  nombre: string;
  direccion: string;
  lat: number;
  lon: number;
}): Promise<{ puntos: PuntoPartida[]; id: number }> {
  const response = await api.post("/rutas/puntos-partida", datos);
  return response.data;
}

export async function eliminarPuntoPartida(id: number): Promise<PuntoPartida[]> {
  const response = await api.delete(`/rutas/puntos-partida/${id}`);
  return response.data.puntos;
}

export async function buscarPuntoPartida(
  direccion: string,
  municipio: string,
  provincia: string
): Promise<BusquedaPuntosPartida> {
  const response = await api.post(
    "/rutas/puntos-partida/buscar",
    { direccion, municipio, provincia },
    { timeout: 60000 }
  );
  return response.data;
}

export async function asignarSalidaRuta(
  manifiestoId: number,
  provincia: string,
  repartidor: string,
  puntoId: number | null
): Promise<void> {
  await api.put(`/rutas/${manifiestoId}/salida`, {
    provincia,
    repartidor,
    punto_id: puntoId,
  });
}
