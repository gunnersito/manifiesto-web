"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Guardamos un token falso para que el resto del sistema no falle
    localStorage.setItem("token", "token_falso_de_prueba");
    localStorage.setItem("role", "admin");
    localStorage.setItem("username", "admin");

    // Redirigimos directo a la página de manifiestos
    router.push("/manifiestos");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center text-slate-500 font-medium">
      Cargando modo prueba...
    </div>
  );
}