import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Exportar",
};

export default function ExportarLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
