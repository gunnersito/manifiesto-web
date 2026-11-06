"use client";

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParadasResponse, ParadaInfo } from "@/lib/api";

interface Props {
  paradas: ParadasResponse;
}

export default function Dashboard({ paradas }: Props) {
  // ============================================================
  // CÁLCULOS
  // ============================================================

  // Métricas generales
  const totalHBLs = paradas.total_hbls;
  const totalParadas = paradas.total_paradas;
  const totalBultos = paradas.paradas.reduce((s, p) => s + p.Bultos, 0);
  const totalPeso = paradas.paradas.reduce((s, p) => s + (p["Peso (Kg)"] || 0), 0);

  // Agrupar paradas por municipio
  const paradasPorMunicipio = useMemo(() => {
    const map: Record<string, { paradas: number; bultos: number; hbls: number }> = {};
    for (const p of paradas.paradas) {
      const m = p.Municipio || "—";
      if (!map[m]) map[m] = { paradas: 0, bultos: 0, hbls: 0 };
      map[m].paradas += 1;
      map[m].bultos += p.Bultos;
      map[m].hbls += p["Cant HBLs"];
    }
    return Object.entries(map)
      .map(([municipio, data]) => ({ municipio, ...data }))
      .sort((a, b) => b.paradas - a.paradas);
  }, [paradas.paradas]);

  // Top 10 municipios por HBLs
  const topMunicipios = useMemo(() => {
    return [...paradasPorMunicipio]
      .sort((a, b) => b.hbls - a.hbls)
      .slice(0, 10);
  }, [paradasPorMunicipio]);

  // Municipios ordenados por bultos
const municipiosPorBultos = useMemo(() => {
  return [...paradasPorMunicipio].sort((a, b) => b.bultos - a.bultos);
}, [paradasPorMunicipio]);

  // Top 10 destinatarios por bultos
  const topDestinatarios = useMemo(() => {
    const map: Record<string, { bultos: number; hbls: number }> = {};
    for (const p of paradas.paradas) {
      const d = p.Destinatario || "—";
      if (!map[d]) map[d] = { bultos: 0, hbls: 0 };
      map[d].bultos += p.Bultos;
      map[d].hbls += p["Cant HBLs"];
    }
    return Object.entries(map)
      .map(([destinatario, data]) => ({ destinatario, ...data }))
      .sort((a, b) => b.bultos - a.bultos)
      .slice(0, 10);
  }, [paradas.paradas]);

  // Distribución de estados (desde paradas, no desde HBLs individuales)
  // Nota: como no tenemos el estado individual, mostramos un placeholder
  // En el futuro se puede enriquecer con estados individuales
  const distribucionEstados = useMemo(() => {
    const conteo: Record<string, number> = {
      Pendiente: 0,
      Despachada: 0,
      "Devuelto Almacén": 0,
      Entregada: 0,
    };
    // Contamos los HBLs de cada parada (aproximación)
    for (const p of paradas.paradas) {
      const estado = p.Estado || "Pendiente";
      if (conteo[estado] !== undefined) {
        conteo[estado] += p["Cant HBLs"];
      } else {
        conteo["Pendiente"] += p["Cant HBLs"];
      }
    }
    return Object.entries(conteo)
      .filter(([_, value]) => value > 0)
      .map(([estado, value]) => ({ estado, value }));
  }, [paradas.paradas]);

  const COLORES_ESTADOS: Record<string, string> = {
    Pendiente: "#94a3b8",
    Despachada: "#3b82f6",
    "Devuelto Almacén": "#ef4444",
    Entregada: "#22c55e",
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div className="space-y-6">
      {/* Métricas generales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Total HBLs" value={totalHBLs} />
        <MetricCard label="Paradas" value={totalParadas} />
        <MetricCard label="Bultos" value={totalBultos} />
        <MetricCard label="Peso (Kg)" value={totalPeso.toFixed(1)} />
      </div>

      {/* Primera fila: Distribución de estados + Top municipios */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Distribución de estados */}
        <Card>
          <CardHeader>
            <CardTitle>📊 Distribución de estados</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={distribucionEstados}
                  dataKey="value"
                  nameKey="estado"
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  label={(entry) => `${entry.estado}: ${entry.value}`}
                >
                  {distribucionEstados.map((entry) => (
                    <Cell
                      key={entry.estado}
                      fill={COLORES_ESTADOS[entry.estado] || "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Top 10 municipios por HBLs */}
        <Card>
          <CardHeader>
            <CardTitle>📍 Top 10 municipios por HBLs</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart
                data={topMunicipios}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="municipio"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="hbls" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Segunda fila: Paradas y Bultos por municipio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Paradas por municipio */}
        <Card>
          <CardHeader>
            <CardTitle>📦 Paradas por municipio</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, paradasPorMunicipio.length * 35)}>
              <BarChart
                data={paradasPorMunicipio}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="municipio"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="paradas" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Bultos por municipio */}
        <Card>
          <CardHeader>
            <CardTitle>🎁 Bultos por municipio</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(300, paradasPorMunicipio.length * 35)}>
              <BarChart
                data={municipiosPorBultos}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" />
                <YAxis
                  type="category"
                  dataKey="municipio"
                  width={120}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip />
                <Bar dataKey="bultos" fill="#10b981" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Top 10 destinatarios */}
      <Card>
        <CardHeader>
          <CardTitle>🏆 Top 10 destinatarios por bultos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={topDestinatarios}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" />
              <YAxis
                type="category"
                dataKey="destinatario"
                width={180}
                tick={{ fontSize: 11 }}
              />
              <Tooltip />
              <Bar dataKey="bultos" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// COMPONENTE: Tarjeta de métrica
// ============================================================
function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-2xl font-bold text-slate-900">{value}</div>
        <div className="text-xs text-slate-600 mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}