"use client";
import Cookies from "js-cookie";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  guardarManifiesto,
  listarManifiestos,
  obtenerManifiesto,
  type ManifiestoMetadata,
  type ManifiestoEnLista,
} from "@/lib/api";

interface ManifiestoContextType {
  // Manifiesto activo
  manifiestoId: number | null;
  metadata: ManifiestoMetadata | null;

  // Lista de manifiestos guardados
  manifiestos: ManifiestoEnLista[];
  loadingManifiestos: boolean;

  // Estado de carga
  loading: boolean;
  error: string | null;

  // Acciones
  subirYGuardar: (file: File) => Promise<{ alreadyExists: boolean }>;
  seleccionarManifiesto: (id: number) => Promise<void>;
  eliminarManifiestoPorId: (id: number) => Promise<void>;
  recargarLista: () => Promise<void>;
  limpiar: () => void;
}

const ManifiestoContext = createContext<ManifiestoContextType | null>(null);

export function ManifiestoProvider({ children }: { children: ReactNode }) {
  const [manifiestoId, setManifiestoId] = useState<number | null>(null);
  const [metadata, setMetadata] = useState<ManifiestoMetadata | null>(null);
  const [manifiestos, setManifiestos] = useState<ManifiestoEnLista[]>([]);
  const [loadingManifiestos, setLoadingManifiestos] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Cargar lista al montar ---
    const recargarLista = useCallback(async () => {
    // Si no hay token, no intentamos cargar nada
    if (!Cookies.get("token")) {
      setLoadingManifiestos(false);
      return [];
    }

    setLoadingManifiestos(true);
    try {
      const lista = await listarManifiestos();
      setManifiestos(lista);
      return lista;
    } catch (err) {
      console.error("Error al cargar manifiestos:", err);
      return [];
    } finally {
      setLoadingManifiestos(false);
    }
  }, []);

  // --- Al montar: cargar lista + último manifiesto ---
      useEffect(() => {
    if (!Cookies.get("token")) return;
    (async () => {
      const lista = await recargarLista();
      if (lista.length > 0 && !manifiestoId) {
        try {
          const guardadoId = localStorage.getItem("manifiesto_id");
          if (guardadoId) {
            const idNumerico = Number(guardadoId);
            const existe = lista.find((m) => m.id === idNumerico);
            if (existe) {
              const meta = await obtenerManifiesto(idNumerico);
              setManifiestoId(meta.id);
              setMetadata(meta);
              return; // Salimos, ya cargamos el guardado
            }
          }
          const meta = await obtenerManifiesto(lista[0].id);
          setManifiestoId(meta.id);
          setMetadata(meta);
        } catch (err) {
          console.error("Error al cargar último manifiesto:", err);
        }
      }
    })();
  }, []);

  // --- Subir archivo y guardar ---
  const subirYGuardar = useCallback(async (file: File) => {
  setLoading(true);
  setError(null);
  try {
    const result = await guardarManifiesto(file);

    if (result.status === "already_exists") {
      // El manifiesto ya existe, cargar el existente
      const meta = await obtenerManifiesto(result.manifiesto_id);
      setManifiestoId(result.manifiesto_id);
      setMetadata(meta);
      return { alreadyExists: true };
    }

    // Nuevo manifiesto
    const meta = await obtenerManifiesto(result.manifiesto_id);
    setManifiestoId(result.manifiesto_id);
    setMetadata(meta);
    await recargarLista();
    return { alreadyExists: false };
  } catch (err: any) {
    const msg =
      err.response?.data?.detail ||
      err.message ||
      "Error al procesar el archivo";
    setError(msg);
    throw err;
  } finally {
    setLoading(false);
  }
}, [recargarLista]);

  // --- Seleccionar manifiesto existente ---
    const seleccionarManifiesto = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    try {
      const meta = await obtenerManifiesto(id);
      setManifiestoId(meta.id);
      setMetadata(meta);

      localStorage.setItem("manifiesto_id", meta.id.toString());
      
      import("@/lib/api").then(({ api }) => {
        api.put("/usuarios/perfil/manifiesto-activo", { manifiesto_id: meta.id })
          .catch((err) => console.error("No se pudo guardar el manifiesto activo en el backend", err));
      });

    } catch (err: any) {
      setError(err.message || "Error al cargar el manifiesto");
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // --- Eliminar manifiesto ---
  const eliminarManifiestoPorId = useCallback(
    async (id: number) => {
      try {
        const { eliminarManifiesto } = await import("@/lib/api");
        await eliminarManifiesto(id);
        // Si el eliminado era el activo, limpiar
        if (id === manifiestoId) {
          setManifiestoId(null);
          setMetadata(null);
        }
        await recargarLista();
        // Si hay otros, cargar el más reciente
        const lista = await listarManifiestos();
        if (lista.length > 0 && id === manifiestoId) {
          await seleccionarManifiesto(lista[0].id);
        }
      } catch (err: any) {
        setError(err.message || "Error al eliminar el manifiesto");
        throw err;
      }
    },
    [manifiestoId, recargarLista, seleccionarManifiesto]
  );

  // --- Limpiar (deseleccionar) ---
  const limpiar = useCallback(() => {
    setManifiestoId(null);
    setMetadata(null);
    setError(null);
  }, []);

  return (
    <ManifiestoContext.Provider
      value={{
        manifiestoId,
        metadata,
        manifiestos,
        loadingManifiestos,
        loading,
        error,
        subirYGuardar,
        seleccionarManifiesto,
        eliminarManifiestoPorId,
        recargarLista,
        limpiar,
      }}
    >
      {children}
    </ManifiestoContext.Provider>
  );
}

export function useManifiesto() {
  const context = useContext(ManifiestoContext);
  if (!context) {
    throw new Error(
      "useManifiesto debe usarse dentro de un ManifiestoProvider"
    );
  }
  return context;
}