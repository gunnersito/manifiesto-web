"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BarChart3,
  Boxes,
  ChevronDown,
  LayoutDashboard,
  MapPin,
  Package,
  Table,
  Upload,
} from "lucide-react";
import { useManifiesto } from "@/contexts/ManifiestoContext";
import { ComparadorManifiestos } from "@/components/ComparadorManifiestos";

// Alto por fila, con topes para que los gráficos no crezcan sin medida
const ALTO_MIN = 220;
const ALTO_MAX = 440;
const alturaBarras = (filas: number) =>
  Math.min(ALTO_MAX, Math.max(ALTO_MIN, filas * 28));

const MARGEN = { top: 4, right: 16, left: 0, bottom: 4 };
const EJE_X = {
  type: "number" as const,
  allowDecimals: false,
  tick: { fontSize: 11 },
  tickFormatter: (valor: number) => valor.toLocaleString("es"),
};

export default function DashboardPage() {
  const { metadata } = useManifiesto();

  // --- Sin datos ---
  if (!metadata) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-12 text-center">
            <BarChart3 className="mx-auto mb-4 h-14 w-14 text-slate-300" />
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              No hay manifiesto cargado
            </h1>
            <p className="text-slate-600 mb-6">
              Sube un manifiesto Excel para ver el dashboard.
            </p>
            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-medium px-6 py-3 rounded-lg transition-colors"
            >
              <Upload className="w-5 h-5" />
              Ir a Subir
            </Link>
          </div>
          <ComparadorManifiestos />
        </div>
      </main>
    );
  }

  const provincias = metadata.resumen;

  const provinciasPorParadas = [...provincias].sort(
    (a, b) => b.paradas - a.paradas
  );
  const provinciasPorBultos = [...provincias].sort(
    (a, b) => b.bultos - a.bultos
  );
  const provinciasPorHBLs = [...provincias].sort((a, b) => b.hbls - a.hbls);

  const totalHBLs = provincias.reduce((s, p) => s + p.hbls, 0);
  const totalParadas = provincias.reduce((s, p) => s + p.paradas, 0);
  const totalBultos = provincias.reduce((s, p) => s + p.bultos, 0);

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-12 px-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold text-slate-900">
              <LayoutDashboard className="w-7 h-7 text-primary" />
              Dashboard
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Resumen visual del manifiesto completo
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <div className="w-2 h-2 rounded-full bg-primary"></div>
            <span>{metadata.nombre_archivo}</span>
          </div>
        </div>

        {/* Métricas */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Metric label="Total HBLs" value={totalHBLs} />
          <Metric label="Provincias" value={provincias.length} />
          <Metric label="Paradas totales" value={totalParadas} />
          <Metric label="Bultos totales" value={totalBultos} />
        </div>

        {/* Gráfico 1: Paradas */}
        <details className="group bg-white rounded-2xl shadow-sm border border-slate-200" open>
          <summary className="list-none cursor-pointer p-6 flex items-center gap-2 select-none">
            <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
            <MapPin className="w-5 h-5 text-slate-500" />
            <span className="text-lg font-semibold text-slate-900">
              Paradas por provincia
            </span>
            <span className="text-xs text-slate-500 ml-2">
              ({provinciasPorParadas.length} provincias)
            </span>
          </summary>
          <div className="p-6 pt-0">
            <ResponsiveContainer width="100%" height={alturaBarras(provinciasPorParadas.length)}>
              <BarChart
                data={provinciasPorParadas}
                layout="vertical"
                margin={MARGEN}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis {...EJE_X} />
                <YAxis
                  type="category"
                  dataKey="provincia"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip cursor={{ fill: "#f1f5f9" }} />
                <Bar
                  dataKey="paradas"
                  name="Paradas"
                  fill="#8b5cf6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </details>

        {/* Gráfico 2: Bultos */}
        <details className="group bg-white rounded-2xl shadow-sm border border-slate-200" open>
          <summary className="list-none cursor-pointer p-6 flex items-center gap-2 select-none">
            <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
            <Package className="w-5 h-5 text-slate-500" />
            <span className="text-lg font-semibold text-slate-900">
              Bultos por provincia
            </span>
            <span className="text-xs text-slate-500 ml-2">
              ({provinciasPorBultos.length} provincias)
            </span>
          </summary>
          <div className="p-6 pt-0">
            <ResponsiveContainer width="100%" height={alturaBarras(provinciasPorBultos.length)}>
              <BarChart
                data={provinciasPorBultos}
                layout="vertical"
                margin={MARGEN}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis {...EJE_X} />
                <YAxis
                  type="category"
                  dataKey="provincia"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip cursor={{ fill: "#f1f5f9" }} />
                <Bar
                  dataKey="bultos"
                  name="Bultos"
                  fill="#10b981"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </details>

        {/* Gráfico 3: HBLs */}
        <details className="group bg-white rounded-2xl shadow-sm border border-slate-200" open>
          <summary className="list-none cursor-pointer p-6 flex items-center gap-2 select-none">
            <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
            <Boxes className="w-5 h-5 text-slate-500" />
            <span className="text-lg font-semibold text-slate-900">
              HBLs por provincia
            </span>
            <span className="text-xs text-slate-500 ml-2">
              ({provinciasPorHBLs.length} provincias)
            </span>
          </summary>
          <div className="p-6 pt-0">
            <ResponsiveContainer width="100%" height={alturaBarras(provinciasPorHBLs.length)}>
              <BarChart
                data={provinciasPorHBLs}
                layout="vertical"
                margin={MARGEN}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis {...EJE_X} />
                <YAxis
                  type="category"
                  dataKey="provincia"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip cursor={{ fill: "#f1f5f9" }} />
                <Bar
                  dataKey="hbls"
                  name="HBLs"
                  fill="#3b82f6"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </details>

        {/* Tabla resumen */}
        <details className="group bg-white rounded-2xl shadow-sm border border-slate-200" open>
          <summary className="list-none cursor-pointer p-6 flex items-center gap-2 select-none">
            <ChevronDown className="w-5 h-5 text-slate-700 transition-transform group-open:rotate-180" />
            <Table className="w-5 h-5 text-slate-500" />
            <span className="text-lg font-semibold text-slate-900">
              Resumen por provincia
            </span>
          </summary>
          <div className="p-6 pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-semibold text-slate-700">Provincia</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">HBLs</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">Paradas</th>
                    <th className="pb-2 font-semibold text-slate-700 text-right">Bultos</th>
                  </tr>
                </thead>
                <tbody>
                  {provinciasPorHBLs.map((p) => (
                    <tr
                      key={p.provincia}
                      className="border-b border-slate-100 last:border-0 hover:bg-slate-50"
                    >
                      <td className="py-2 font-medium text-slate-900">
                        {p.provincia}
                      </td>
                      <td className="py-2 text-right text-slate-700">{p.hbls}</td>
                      <td className="py-2 text-right text-slate-700">{p.paradas}</td>
                      <td className="py-2 text-right text-slate-700">{p.bultos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>

        {/* Comparar manifiestos */}
        <ComparadorManifiestos />
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 p-4">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-600 mt-1">{label}</div>
    </div>
  );
}