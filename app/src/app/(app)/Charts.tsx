"use client";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Line, LineChart } from "recharts";

const TT = { background: "var(--color-white)", border: "1px solid var(--color-line)", borderRadius: 8, color: "var(--text)" };
const COLORS = ["var(--chart-1)", "var(--chart-2)", "#2c4180", "#d98a0a", "#64748b", "#10b981"];

export function StatusChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} layout="vertical" margin={{ right: 8, left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--chart-grid)" />
        <XAxis type="number" allowDecimals={false} orientation="top" fontSize={11} />
        <YAxis type="category" dataKey="name" width={130} orientation="right" fontSize={11} />
        <Tooltip cursor={{ fill: "var(--color-slate-100)" }} contentStyle={TT} />
        <Bar dataKey="value" name="العدد" fill="var(--chart-1)" radius={[4, 0, 0, 4]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
export function WorkloadChart({ data }: { data: { date: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" />
        <XAxis dataKey="date" fontSize={11} reversed />
        <YAxis allowDecimals={false} fontSize={11} orientation="right" />
        <Tooltip contentStyle={TT} />
        <Line dataKey="count" name="أجهزة مستلمة" stroke="var(--chart-2)" strokeWidth={3} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
export function TypeChart({ data }: { data: { name: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} label>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={TT} />
      </PieChart>
    </ResponsiveContainer>
  );
}
