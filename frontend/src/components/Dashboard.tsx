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
import type { LucideIcon } from "lucide-react";
import { ChartPie, MapPin, Package, Route, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ParadasResponse } from "@/lib/api";

interface Props {
  paradas: ParadasResponse;
}

// Alto de una barra por fila, con un área visible fija y desplazamiento
// cuando hay más filas de las que caben en la tarjeta.
const ALTO_FILA = 26;
const ALTO_MIN = 220;
const ALTO_VISIBLE = 380;

const MARGEN = { top: 4, right: 16, left: 0, bottom: 4 };
const EJE_X = {
  type: "number" as const,
  allowDecimals: false,
  tick: { fontSize: 11 },
  tickFormatter: (valor: number) => valor.toLocaleString("es"),
};

// Recorta por palabras para no partir un nombre a la mitad: "SAN MIGUEL DEL
// PADRÓN" queda en "SAN MIGUEL DEL…", no en "SAN MIGUELDEL …".
const truncar = (texto: string, max = 16) => {
  if (texto.length <= max) return texto;
  const corte = texto.slice(0, max - 1);
  const espacio = corte.lastIndexOf(" ");
  return `${(espacio > 4 ? corte.slice(0, espacio) : corte).trimEnd()}…`;
};

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
            <CardTitle className="flex items-center gap-2">
              <ChartPie className="w-4 h-4 text-slate-500" />
              Distribución de estados
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={distribucionEstados}
                  dataKey="value"
                  nameKey="estado"
                  cx="50%"
                  cy="50%"
                  innerRadius="52%"
                  outerRadius="78%"
                  paddingAngle={2}
                >
                  {distribucionEstados.map((entry) => (
                    <Cell
                      key={entry.estado}
                      fill={COLORES_ESTADOS[entry.estado] || "#94a3b8"}
                    />
                  ))}
                </Pie>
                <Tooltip />
                <Legend
                  verticalAlign="bottom"
                  iconSize={9}
                  wrapperStyle={{ fontSize: 12 }}
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <GraficoBarras
          titulo="Top 10 municipios por HBLs"
          icono={MapPin}
          datos={topMunicipios}
          categoria="municipio"
          dataKey="hbls"
          nombre="HBLs"
          color="#3b82f6"
        />
      </div>

      {/* Segunda fila: Paradas y Bultos por municipio */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GraficoBarras
          titulo="Paradas por municipio"
          icono={Route}
          datos={paradasPorMunicipio}
          categoria="municipio"
          dataKey="paradas"
          nombre="Paradas"
          color="#8b5cf6"
        />

        <GraficoBarras
          titulo="Bultos por municipio"
          icono={Package}
          datos={municipiosPorBultos}
          categoria="municipio"
          dataKey="bultos"
          nombre="Bultos"
          color="#10b981"
        />
      </div>

      {/* Top 10 destinatarios */}
      <GraficoBarras
        titulo="Top 10 destinatarios por bultos"
        icono={Trophy}
        datos={topDestinatarios}
        categoria="destinatario"
        dataKey="bultos"
        nombre="Bultos"
        color="#f59e0b"
        anchoEje={150}
        maxCategoria={20}
      />
    </div>
  );
}

// ============================================================
// COMPONENTE: Gráfico de barras horizontales
// ============================================================
function GraficoBarras({
  titulo,
  icono: Icono,
  datos,
  categoria,
  dataKey,
  nombre,
  color,
  anchoEje = 124,
  maxCategoria = 16,
}: {
  titulo: string;
  icono: LucideIcon;
  datos: Record<string, string | number>[];
  categoria: string;
  dataKey: string;
  nombre: string;
  color: string;
  anchoEje?: number;
  maxCategoria?: number;
}) {
  const alto = Math.max(ALTO_MIN, datos.length * ALTO_FILA);
  const conScroll = alto > ALTO_VISIBLE;

  // Recharts parte el texto del eje en varias líneas cuando no cabe en el
  // ancho del eje. Aquí se dibuja una sola línea ya recortada, así todas las
  // barras quedan alineadas y la fila conserva su alto.
  const etiqueta = ({ x, y, payload }: {
    x?: number;
    y?: number;
    payload?: { value?: string };
  }) => (
    <text
      x={x}
      y={y}
      dy={3}
      textAnchor="end"
      fontSize={11}
      fill="#64748b"
    >
      {truncar(String(payload?.value ?? ""), maxCategoria)}
    </text>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icono className="w-4 h-4 text-slate-500" />
          {titulo}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div
          className={conScroll ? "overflow-y-auto pr-1" : undefined}
          style={conScroll ? { maxHeight: ALTO_VISIBLE } : undefined}
        >
          <ResponsiveContainer width="100%" height={alto}>
            <BarChart data={datos} layout="vertical" margin={MARGEN}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis {...EJE_X} />
              <YAxis
                type="category"
                dataKey={categoria}
                width={anchoEje}
                interval={0}
                tick={etiqueta}
              />
              <Tooltip cursor={{ fill: "#f1f5f9" }} />
              <Bar
                dataKey={dataKey}
                name={nombre}
                fill={color}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
        {conScroll && (
          <p className="mt-2 text-xs text-slate-500">
            Desplázate para ver los {datos.length} municipios.
          </p>
        )}
      </CardContent>
    </Card>
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
