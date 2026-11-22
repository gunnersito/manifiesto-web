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
export interface ProvinciaResumen {
  provincia: string;
  hbls: number;
  paradas: number;
  bultos: number;
}

export interface UploadResponse {
  status: string;
  filename: string;
  hoja: string | null;
  total_filas: number;
  filas_eliminadas: number;
  columnas_renombradas: Record<string, string>;
  provincias: ProvinciaResumen[];
  preview: Record<string, any>[];
}

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

export async function listarHojas(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.post("/manifiestos/hojas", formData, {
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

export async function obtenerParadas(
  file: File,
  provincia: string,
  hoja?: string,
  umbral: number = 0.9
): Promise<ParadasResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (hoja) formData.append("hoja", hoja);
  formData.append("umbral", umbral.toString());

  const url = `/manifiestos/paradas/${encodeURIComponent(provincia)}`;
  const response = await api.post<ParadasResponse>(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export interface HBLDetalle {
  "HBL Número": string;
  "Direccion del destinatario": string;
  Municipio: string;
  "Nombre y Apellidos del DESTINATARIO:"?: string;
  "Teléfono del DESTINATARIO"?: string;
  "Contenido del paquete (Descripción)"?: string;
  "Bultos (Cant.)": number;
  "Peso (Kg)"?: number;
  Estado?: string;
}

export interface HBLsParadaResponse {
  provincia: string;
  municipio: string;
  direccion: string;
  total_hbls: number;
  hbls: HBLDetalle[];
}

export async function obtenerHBLsParada(
  file: File,
  provincia: string,
  municipio: string,
  direccion: string,
  hoja?: string,
  umbral: number = 0.9
): Promise<HBLsParadaResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("provincia", provincia);
  formData.append("municipio", municipio);
  formData.append("direccion", direccion);
  if (hoja) formData.append("hoja", hoja);
  formData.append("umbral", umbral.toString());

  const response = await api.post<HBLsParadaResponse>(
    "/manifiestos/hbls-parada",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
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
// EXPORTACIONES
// ============================================================
async function descargarArchivo(
  url: string,
  file: File,
  filename: string,
  hoja?: string,
  umbral: number = 0.9
): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);
  if (hoja) formData.append("hoja", hoja);
  formData.append("umbral", umbral.toString());

  const response = await api.post(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    responseType: "blob",
  });

  // Crear enlace de descarga
  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const link = document.createElement("a");
  link.href = window.URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(link.href);
}

export async function exportarProvincia(
  file: File,
  provincia: string
): Promise<void> {
  const url = `/manifiestos/exportar/${encodeURIComponent(provincia)}`;
  await descargarArchivo(url, file, `manifiesto_${provincia}.xlsx`);
}

export async function exportarHojaRuta(
  file: File,
  provincia: string
): Promise<void> {
  const url = `/manifiestos/exportar-ruta/${encodeURIComponent(provincia)}`;
  await descargarArchivo(url, file, `ruta_${provincia}.xlsx`);
}

export async function exportarTodasProvincias(file: File): Promise<void> {
  const url = `/manifiestos/exportar-todas`;
  await descargarArchivo(url, file, `manifiesto_todas_provincias.xlsx`);
}

export async function exportarPorMunicipios(
  file: File,
  provincia: string
): Promise<void> {
  const url = `/manifiestos/exportar-por-municipios/${encodeURIComponent(provincia)}`;
  await descargarArchivo(
    url,
    file,
    `manifiesto_${provincia}_por_municipios.xlsx`
  );
}

export interface ParadasFiltradasResponse extends ParadasResponse {
  total_hbls_sin_filtro: number;
}

export async function obtenerParadasFiltradas(
  file: File,
  provincia: string,
  busqueda: string = "",
  estado: string = "",
  ubicacion: string = "",
  hoja?: string,
  umbral: number = 0.9
): Promise<ParadasFiltradasResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("busqueda", busqueda);
  formData.append("estado", estado);
  formData.append("ubicacion", ubicacion);
  if (hoja) formData.append("hoja", hoja);
  formData.append("umbral", umbral.toString());

  const url = `/manifiestos/paradas-filtradas/${encodeURIComponent(provincia)}`;
  const response = await api.post<ParadasFiltradasResponse>(url, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
}

export interface ResumenFiltradoResponse {
  status: string;
  total_filas: number;
  total_filas_sin_filtro: number;
  provincias: ProvinciaResumen[];
}

export async function obtenerResumenFiltrado(
  file: File,
  busqueda: string = "",
  estado: string = "",
  ubicacion: string = "",
  hoja?: string,
  umbral: number = 0.9
): Promise<ResumenFiltradoResponse> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("busqueda", busqueda);
  formData.append("estado", estado);
  formData.append("ubicacion", ubicacion);
  if (hoja) formData.append("hoja", hoja);
  formData.append("umbral", umbral.toString());

  const response = await api.post<ResumenFiltradoResponse>(
    "/manifiestos/resumen-filtrado",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
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
  const res = await api.get('/usuarios');
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