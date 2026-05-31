import React, { useEffect, useState } from "react";
import { api } from "../lib/api";
import { Link } from "react-router-dom";
import { useContent } from "../context/ContentContext";
import {
  Bell,
  TrendUp,
  Wrench,
  Package,
  Receipt,
  WarningCircle,
  ArrowUpRight,
  Calculator,
} from "@phosphor-icons/react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

const COLORS = ["#EA580C", "#2563EB", "#16A34A", "#EAB308", "#DC2626", "#A855F7", "#0891B2"];

function StatCard({ label, value, hint, icon: Icon, accent, testid }) {
  return (
    <div className="border border-zinc-200 bg-white p-5 hover:border-zinc-900 transition-colors" data-testid={testid}>
      <div className="flex items-start justify-between mb-3">
        <div className="label-eyebrow">{label}</div>
        <Icon size={18} className={accent || "text-zinc-400"} weight="bold" />
      </div>
      <div className="font-display font-black text-4xl tracking-tight text-zinc-900 leading-none">
        {value}
      </div>
      {hint && <div className="mt-2 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const { content } = useContent();

  useEffect(() => {
    api.get("/dashboard/stats").then(({ data }) => {
      setStats(data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 text-zinc-500 font-display tracking-wider uppercase text-sm">Loading dashboard…</div>
    );
  }

  if (!stats) return <div className="p-8">Failed to load.</div>;

  const utilizationPct = stats.total_units > 0
    ? Math.round((stats.on_rent_units / stats.total_units) * 100)
    : 0;

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="dashboard-page">
      {/* Hero */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="label-eyebrow">{content.dashboard_eyebrow}</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">
            {content.dashboard_title}
          </h1>
          <p className="text-zinc-500 mt-1 text-sm">
            {content.dashboard_subtitle}
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            to="/bracing"
            className="inline-flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-sm text-sm font-display font-semibold uppercase tracking-wider transition-colors"
            data-testid="quick-bracing-btn"
          >
            <Wrench size={16} weight="bold" />
            New Bracing Calc
          </Link>
          <Link
            to="/rentals"
            className="inline-flex items-center gap-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 px-5 py-3 rounded-sm text-sm font-display font-semibold uppercase tracking-wider transition-colors"
            data-testid="quick-rental-btn"
          >
            <Receipt size={16} weight="bold" />
            New Rental
          </Link>
        </div>
      </div>

      {/* Alerts strip */}
      {(stats.overdue_rentals > 0 || stats.maintenance_due > 0 || stats.bookings_starting_soon > 0) && (
        <div className="mb-6 border-l-4 border-red-600 bg-red-50 px-4 py-3 flex flex-wrap items-center gap-4 text-sm" data-testid="alert-strip">
          <WarningCircle size={20} className="text-red-700 shrink-0" weight="fill" />
          {stats.overdue_rentals > 0 && (
            <div className="text-red-800">
              <span className="font-display font-bold">{stats.overdue_rentals}</span> overdue rental{stats.overdue_rentals > 1 ? "s" : ""}
            </div>
          )}
          {stats.maintenance_due > 0 && (
            <div className="text-red-800">
              <span className="font-display font-bold">{stats.maintenance_due}</span> item{stats.maintenance_due > 1 ? "s" : ""} due for service
            </div>
          )}
          {stats.bookings_starting_soon > 0 && (
            <div className="text-red-800">
              <span className="font-display font-bold">{stats.bookings_starting_soon}</span> booking{stats.bookings_starting_soon > 1 ? "s" : ""} starting this week
            </div>
          )}
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          label="Active Rentals"
          value={stats.active_rentals}
          hint={`${stats.due_soon_rentals} due this week`}
          icon={Receipt}
          accent="text-orange-600"
          testid="stat-active-rentals"
        />
        <StatCard
          label="Units On Rent"
          value={stats.on_rent_units}
          hint={`${utilizationPct}% utilization`}
          icon={TrendUp}
          accent="text-blue-600"
          testid="stat-on-rent"
        />
        <StatCard
          label="Available"
          value={stats.available_units}
          hint={`across ${stats.total_equipment_skus} SKUs`}
          icon={Package}
          accent="text-green-600"
          testid="stat-available"
        />
        <StatCard
          label="Service Due"
          value={stats.maintenance_due}
          hint="needs inspection"
          icon={Bell}
          accent="text-yellow-600"
          testid="stat-service-due"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="lg:col-span-2 border border-zinc-200 bg-white p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="label-eyebrow">Utilization</div>
              <h3 className="font-display font-bold text-xl text-zinc-900 mt-1">Fleet Status</h3>
            </div>
            <Link to="/equipment" className="text-xs uppercase tracking-widest text-zinc-500 hover:text-orange-600 inline-flex items-center gap-1 font-display font-medium">
              View all <ArrowUpRight size={12} weight="bold" />
            </Link>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <div className="font-display font-black text-6xl tracking-tight text-zinc-900 leading-none">{utilizationPct}<span className="text-2xl text-zinc-400">%</span></div>
              <div className="text-right">
                <div className="text-xs text-zinc-500">{stats.on_rent_units} of {stats.total_units}</div>
                <div className="label-eyebrow">on rent</div>
              </div>
            </div>
            <div className="relative h-3 bg-zinc-100 overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-orange-600 transition-all duration-700"
                style={{ width: `${utilizationPct}%` }}
              />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-4 mt-4 border-t border-zinc-200">
              <div>
                <div className="label-eyebrow">SKUs</div>
                <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{stats.total_equipment_skus}</div>
              </div>
              <div>
                <div className="label-eyebrow">Total Units</div>
                <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{stats.total_units}</div>
              </div>
              <div>
                <div className="label-eyebrow">Available</div>
                <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{stats.available_units}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="border border-zinc-200 bg-white p-6">
          <div className="label-eyebrow mb-1">Inventory mix</div>
          <h3 className="font-display font-bold text-xl text-zinc-900 mb-4">By Category</h3>
          {stats.category_breakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={stats.category_breakdown}
                  dataKey="count"
                  nameKey="category"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                >
                  {stats.category_breakdown.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-zinc-400 text-sm py-12 text-center">No equipment yet</div>
          )}
          <div className="space-y-1.5 mt-2">
            {stats.category_breakdown.map((c, i) => (
              <div key={c.category} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="capitalize text-zinc-700">{c.category}</span>
                </div>
                <span className="font-mono text-zinc-900">{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="border border-zinc-200 bg-white p-6">
        <div className="label-eyebrow mb-1">Activity log</div>
        <h3 className="font-display font-bold text-xl text-zinc-900 mb-4">Recent Calculations</h3>
        {stats.recent_calculations.length === 0 ? (
          <div className="text-zinc-400 text-sm py-8 text-center border border-dashed border-zinc-200">
            No calculations yet. <Link to="/bracing" className="text-orange-600 font-semibold">Run your first bracing calc →</Link>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {stats.recent_calculations.map((c, i) => (
              <div key={i} className="py-3 flex items-center justify-between text-sm" data-testid={`recent-calc-${i}`}>
                <div className="flex items-center gap-3">
                  {c.type === "bracing" ? (
                    <Wrench size={16} className="text-orange-600" weight="fill" />
                  ) : (
                    <Calculator size={16} className="text-blue-600" weight="fill" />
                  )}
                  <div>
                    <div className="font-display font-medium text-zinc-900 capitalize">{c.type} calculation</div>
                    <div className="text-xs text-zinc-500">{c.user}</div>
                  </div>
                </div>
                <div className="text-xs text-zinc-500 font-mono">
                  {new Date(c.created_at).toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
