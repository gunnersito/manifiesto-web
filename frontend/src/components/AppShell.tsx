"use client";

import { usePathname } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { ManifiestoProvider } from "@/contexts/ManifiestoContext";
import { Toaster } from "sonner";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // En login se muestra la vista limpia, sin sidebar.
  const esLogin = pathname === "/login";

  return (
    <ManifiestoProvider>
      {esLogin ? (
        // Vista limpia para el Login
        <main className="min-h-screen">{children}</main>
      ) : (
        // Vista con Sidebar para el resto de la app.
        // En móvil se apila en columna: barra superior + contenido.
        <div className="flex min-h-screen flex-col bg-slate-50 lg:flex-row">
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-x-auto">{children}</main>
        </div>
      )}
      <Toaster position="top-right" richColors />
    </ManifiestoProvider>
  );
}
