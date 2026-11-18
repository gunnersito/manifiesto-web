import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manifiestos",
};

export default function ManifiestosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
