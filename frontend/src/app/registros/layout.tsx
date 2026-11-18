import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registros",
};

export default function RegistrosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
