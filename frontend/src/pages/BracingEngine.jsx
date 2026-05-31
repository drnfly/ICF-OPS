import React, { useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { useContent } from "../context/ContentContext";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "../components/ui/select";
import { toast } from "sonner";
import { Wrench, WarningCircle, Lightning, Ruler, Wind, Thermometer, Drop } from "@phosphor-icons/react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid } from "recharts";

const DEFAULTS = {
  wall_height_ft: 9,
  wall_length_ft: 40,
  wind_exposure: "B",
  pour_rate_ft_hr: 4,
  concrete_temp_f: 70,
  concrete_slump_in: 5,
  core_thickness_in: 6,
  safety_factor: 2.0,
};

function FieldRow({ icon: Icon, label, hint, children }) {
  return (
    <div className="grid sm:grid-cols-12 gap-3 sm:gap-4 items-start py-3 border-b border-zinc-100">
      <Label className="sm:col-span-5 flex items-center gap-2 pt-2">
        <Icon size={16} className="text-orange-600" weight="bold" />
        <div>
          <div className="font-display font-medium text-sm text-zinc-900">{label}</div>
          {hint && <div className="text-xs text-zinc-500 font-normal mt-0.5">{hint}</div>}
        </div>
      </Label>
      <div className="sm:col-span-7">{children}</div>
    </div>
  );
}

function ResultStat({ label, value, unit, big, accent, testid }) {
  return (
    <div className={`border ${accent ? "border-orange-600 bg-orange-50" : "border-zinc-200 bg-white"} p-4`} data-testid={testid}>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-display font-black ${big ? "text-5xl" : "text-3xl"} tracking-tight text-zinc-900 leading-none mt-2`}>
        {value}
        {unit && <span className={`${big ? "text-xl" : "text-base"} text-zinc-500 ml-1.5 font-medium`}>{unit}</span>}
      </div>
    </div>
  );
}

export default function BracingEngine() {
  const { content } = useContent();
  const [form, setForm] = useState({
    ...DEFAULTS,
    safety_factor: Number(content.default_safety_factor) || DEFAULTS.safety_factor,
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function calculate(e) {
    e?.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      Object.keys(payload).forEach((k) => {
        if (typeof DEFAULTS[k] === "number") payload[k] = Number(payload[k]);
      });
      const { data } = await api.post("/bracing/calculate", payload);
      setResult(data);
      toast.success("Bracing plan calculated");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Calculation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="bracing-page">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow">Engineering · ACI 347</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Bracing Engine</h1>
          <p className="text-zinc-500 mt-1 text-sm max-w-xl">
            {content.bracing_subtitle}
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* INPUT FORM */}
        <form onSubmit={calculate} className="lg:col-span-2 border border-zinc-200 bg-white p-6 self-start" data-testid="bracing-form">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={20} weight="fill" className="text-orange-600" />
            <h2 className="font-display font-bold text-xl text-zinc-900">Wall & Pour Specs</h2>
          </div>

          <FieldRow icon={Ruler} label="Wall height" hint="floor-to-top, feet">
            <Input
              type="number" step="0.5" min="1" max="20"
              value={form.wall_height_ft}
              onChange={(e) => update("wall_height_ft", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-wall-height"
            />
          </FieldRow>
          <FieldRow icon={Ruler} label="Wall length" hint="single run, feet">
            <Input
              type="number" step="1" min="1" max="500"
              value={form.wall_length_ft}
              onChange={(e) => update("wall_length_ft", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-wall-length"
            />
          </FieldRow>
          <FieldRow icon={Wind} label="Wind exposure" hint="ASCE 7: B urban, C open, D coastal">
            <Select value={form.wind_exposure} onValueChange={(v) => update("wind_exposure", v)}>
              <SelectTrigger className="rounded-sm" data-testid="select-wind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="B">B — Urban / Suburban</SelectItem>
                <SelectItem value="C">C — Open Terrain</SelectItem>
                <SelectItem value="D">D — Coastal / Unobstructed</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow icon={Lightning} label="Pour rate" hint="ft / hour of rise">
            <Input
              type="number" step="0.5" min="0.5" max="15"
              value={form.pour_rate_ft_hr}
              onChange={(e) => update("pour_rate_ft_hr", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-pour-rate"
            />
          </FieldRow>
          <FieldRow icon={Thermometer} label="Concrete temp" hint="degrees Fahrenheit">
            <Input
              type="number" step="5" min="30" max="110"
              value={form.concrete_temp_f}
              onChange={(e) => update("concrete_temp_f", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-temp"
            />
          </FieldRow>
          <FieldRow icon={Drop} label="Concrete slump" hint="inches">
            <Input
              type="number" step="0.5" min="2" max="10"
              value={form.concrete_slump_in}
              onChange={(e) => update("concrete_slump_in", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-slump"
            />
          </FieldRow>
          <FieldRow icon={Ruler} label="Core thickness" hint="ICF concrete core, inches">
            <Select value={String(form.core_thickness_in)} onValueChange={(v) => update("core_thickness_in", v)}>
              <SelectTrigger className="rounded-sm" data-testid="select-core">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[4, 6, 8, 10, 12].map((v) => (
                  <SelectItem key={v} value={String(v)}>{v}″ core</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>
          <FieldRow icon={WarningCircle} label="Safety factor" hint="multiplier on brace capacity">
            <Input
              type="number" step="0.1" min="1.5" max="3.0"
              value={form.safety_factor}
              onChange={(e) => update("safety_factor", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-safety"
            />
          </FieldRow>

          <Button
            type="submit"
            disabled={loading}
            data-testid="bracing-calc-submit"
            className="mt-6 w-full h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display font-bold uppercase tracking-wider transition-colors"
          >
            {loading ? "Calculating…" : "Calculate Bracing Plan"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setForm(DEFAULTS)}
            className="mt-2 w-full rounded-sm font-display tracking-wider uppercase text-xs"
            data-testid="bracing-reset-btn"
          >
            Reset to defaults
          </Button>
        </form>

        {/* RESULTS */}
        <div className="lg:col-span-3">
          {!result ? (
            <div className="border border-dashed border-zinc-300 bg-zinc-50 grid-paper p-10 text-center min-h-[400px] flex flex-col items-center justify-center">
              <Wrench size={48} className="text-zinc-300 mb-4" weight="duotone" />
              <div className="font-display font-bold text-zinc-700 text-lg">Ready when you are</div>
              <div className="text-sm text-zinc-500 mt-1 max-w-md">
                Tap <span className="font-display font-semibold text-zinc-900">Calculate</span> to get spacing, count, tie-down hardware, and a pressure-profile chart for your wall.
              </div>
            </div>
          ) : (
            <div className="space-y-4" data-testid="bracing-result">
              {/* Headline numbers */}
              <div className="grid grid-cols-2 gap-3">
                <ResultStat label="Brace spacing" value={result.recommended_spacing_ft} unit="ft o.c." big accent testid="result-spacing" />
                <ResultStat label="Total braces" value={result.brace_count} unit="ea" big accent testid="result-count" />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ResultStat label="Brace type" value={<span className="capitalize">{result.brace_type}</span>} unit="" testid="result-brace-type" />
                <ResultStat label="Lateral pressure" value={result.lateral_pressure_psf} unit="psf" testid="result-pressure" />
                <ResultStat label="Load/lf" value={result.load_per_lf} unit="lbs" testid="result-load" />
                <ResultStat label="Safety factor" value={`${result.safety_factor}×`} unit="" testid="result-sf" />
              </div>

              {/* Hardware */}
              <div className="border border-zinc-200 bg-white p-5">
                <div className="label-eyebrow mb-3">Hardware schedule</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-zinc-500 text-xs">Wedge anchors (base)</div>
                    <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{result.wedge_anchors}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-xs">Tie-down anchors</div>
                    <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{result.tiedown_anchors}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-xs">Lag screws (top)</div>
                    <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{result.lag_screws}</div>
                  </div>
                  <div>
                    <div className="text-zinc-500 text-xs">Waler rows × LF</div>
                    <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{result.waler_rows} × {result.waler_linear_ft}</div>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t border-zinc-100 text-sm">
                  <div className="label-eyebrow mb-1">Tie pattern</div>
                  <div className="font-mono text-zinc-700">{result.tie_pattern}</div>
                </div>
              </div>

              {/* Pressure chart */}
              <div className="border border-zinc-200 bg-white p-5">
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <div className="label-eyebrow">ACI 347 · Plastic concrete</div>
                    <div className="font-display font-bold text-lg text-zinc-900">Lateral Pressure Profile</div>
                  </div>
                  <div className="text-xs text-zinc-500">Wind ×{result.wind_multiplier}</div>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart
                    data={result.pressure_profile.map((p) => ({
                      depth: (form.wall_height_ft - p.height_ft).toFixed(1),
                      pressure: p.pressure_psf,
                    })).reverse()}
                    margin={{ left: 0, right: 16, top: 8, bottom: 8 }}
                  >
                    <CartesianGrid stroke="#E4E4E7" strokeDasharray="3 3" />
                    <XAxis dataKey="depth" stroke="#52525B" fontSize={11} label={{ value: "Depth from top (ft)", position: "insideBottom", offset: -2, fontSize: 11 }} />
                    <YAxis stroke="#52525B" fontSize={11} label={{ value: "psf", angle: -90, position: "insideLeft", fontSize: 11 }} />
                    <Tooltip />
                    <ReferenceLine y={result.lateral_pressure_psf} stroke="#EA580C" strokeDasharray="4 4" label={{ value: `P_max ${result.lateral_pressure_psf} psf`, fontSize: 10, fill: "#EA580C", position: "insideTopRight" }} />
                    <Line type="monotone" dataKey="pressure" stroke="#09090B" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 text-sm" data-testid="result-warnings">
                  <div className="font-display font-bold text-yellow-900 mb-2 flex items-center gap-2">
                    <WarningCircle size={16} weight="fill" />
                    Field warnings
                  </div>
                  <ul className="space-y-1 text-yellow-800">
                    {result.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}

              <div className="text-xs text-zinc-400">
                Calculated {new Date(result.calculated_at).toLocaleString()} · ACI 347 · ASCE 7 wind exposure
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
