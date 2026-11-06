import axios from "axios";

// 1. Forzamos la URL (si el .env.local falla, esto lo soluciona)
const API_URL = "https://manifiesto-backend.onrender.com/api";

// 2. Creamos la instancia
export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// 3. EL INTERCEPTOR MÁGICO 👇
// Esto se ejecuta ANTES de cada petición y le añade el token
api.interceptors.request.use(
  (config) => {
    // Verificamos que estemos en el navegador (porque localStorage no existe en el servidor)
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

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
): Promise<UploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  if (hoja) formData.append("hoja", hoja);
  formData.append("umbral", umbral.toString());

  const response = await api.post<UploadResponse>("/manifiestos/upload", formData, {
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

export async function obtenerHBLsManifiesto(
  id: number,
  pagina: number = 1,
  por_pagina: number = 15,
  busqueda: string = "",
  estado: string = "",
  provincia: string = ""
): Promise<HBLsPaginaResponse> {
  const params = new URLSearchParams({
    pagina: pagina.toString(),
    por_pagina: por_pagina.toString(),
    busqueda,
    estado,
    provincia,
  });
  const response = await api.get(`/manifiestos/${id}/hbls?${params.toString()}`);
  return response.data;
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
    por_pagina: por_pagina.toString(),
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
  const response = await api.post(url, {}, { responseType: "blob" });

  const blob = new Blob([response.data], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  // 👇 Limpiamos la extensión .xlsx del nombre si viene incluida
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
  const nombreFinal = nombreBase ? nombreBase.replace(".xlsx", "").replace(".xls", "") : manifiestoId;
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

// Interceptor para añadir el token a cada petición
api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export async function loginRequest(username: string, password: string) {
  const response = await api.post("/auth/login", { username, password });
  Cookies.set("token", response.data.access_token, { expires: 7 });
  Cookies.set("role", response.data.role, { expires: 7 });
  Cookies.set("username", response.data.username, { expires: 7 }); // 👈 Añade esta línea
  return response.data;
}

export function logoutRequest() {
  Cookies.remove("token");
  Cookies.remove("role");
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