import React, { useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Wrench, WarningCircle, Ruler, ArrowsOut } from "@phosphor-icons/react";

const DEFAULTS = {
  corners: 4,
  wall_length_ft: 40,
  wall_height_ft: 9,
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
  const [form, setForm] = useState({ ...DEFAULTS });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function calculate(e) {
    e?.preventDefault();
    setLoading(true);
    try {
      const payload = {
        corners: Number(form.corners),
        wall_length_ft: Number(form.wall_length_ft),
        wall_height_ft: Number(form.wall_height_ft),
      };
      const { data } = await api.post("/bracing/calculate", payload);
      setResult(data);
      toast.success("Brace count calculated");
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
          <div className="label-eyebrow">Field Bracing</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Bracing Engine</h1>
          <p className="text-zinc-500 mt-1 text-sm max-w-xl">
            Enter your corners, wall run, and height. Get a fast strongback count — <span className="font-display font-semibold text-zinc-700">1 brace per corner + 1 brace every 4 ft of wall</span>.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* INPUT FORM */}
        <form onSubmit={calculate} className="lg:col-span-2 border border-zinc-200 bg-white p-6 self-start" data-testid="bracing-form">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={20} weight="fill" className="text-orange-600" />
            <h2 className="font-display font-bold text-xl text-zinc-900">Wall Layout</h2>
          </div>

          <FieldRow icon={ArrowsOut} label="Number of corners" hint="inside + outside corners">
            <Input
              type="number" step="1" min="0" max="500"
              value={form.corners}
              onChange={(e) => update("corners", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-corners"
            />
          </FieldRow>
          <FieldRow icon={Ruler} label="Linear ft of wall" hint="total wall run, feet">
            <Input
              type="number" step="1" min="1" max="5000"
              value={form.wall_length_ft}
              onChange={(e) => update("wall_length_ft", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-wall-length"
            />
          </FieldRow>
          <FieldRow icon={Ruler} label="Wall height" hint="floor-to-top, feet">
            <Input
              type="number" step="0.5" min="1" max="30"
              value={form.wall_height_ft}
              onChange={(e) => update("wall_height_ft", e.target.value)}
              className="rounded-sm focus:border-orange-600 focus:ring-orange-600"
              data-testid="input-wall-height"
            />
          </FieldRow>

          <Button
            type="submit"
            disabled={loading}
            data-testid="bracing-calc-submit"
            className="mt-6 w-full h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display font-bold uppercase tracking-wider transition-colors"
          >
            {loading ? "Calculating…" : "Calculate Braces"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => { setForm(DEFAULTS); setResult(null); }}
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
                Tap <span className="font-display font-semibold text-zinc-900">Calculate</span> to get your total strongback count and the corner / wall breakdown.
              </div>
            </div>
          ) : (
            <div className="space-y-4" data-testid="bracing-result">
              {/* Headline number */}
              <ResultStat label="Total strongbacks needed" value={result.brace_count} unit="ea" big accent testid="result-count" />

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <ResultStat label="Corner braces" value={result.corner_braces} unit="ea" testid="result-corner-braces" />
                <ResultStat label="Wall braces" value={result.wall_braces} unit="ea" testid="result-wall-braces" />
              </div>

              {/* Math breakdown */}
              <div className="border border-zinc-200 bg-white p-5" data-testid="result-breakdown">
                <div className="label-eyebrow mb-3">How this was figured</div>
                <ul className="space-y-2 text-sm text-zinc-700 font-mono">
                  <li className="flex justify-between border-b border-zinc-100 pb-2">
                    <span>{result.corners} corners × 1 brace</span>
                    <span className="font-bold text-zinc-900">{result.corner_braces}</span>
                  </li>
                  <li className="flex justify-between border-b border-zinc-100 pb-2">
                    <span>{result.wall_length_ft} ft ÷ 4 ft (round up)</span>
                    <span className="font-bold text-zinc-900">{result.wall_braces}</span>
                  </li>
                  <li className="flex justify-between pt-1">
                    <span className="font-display uppercase tracking-wider text-zinc-900">Total</span>
                    <span className="font-bold text-orange-600 text-lg">{result.brace_count}</span>
                  </li>
                </ul>
                <div className="mt-3 text-xs text-zinc-500">
                  Wall height: <span className="font-mono text-zinc-700">{result.wall_height_ft} ft</span> · Brace type: <span className="capitalize text-zinc-700">{result.brace_type}</span>
                </div>
              </div>

              {/* Warnings */}
              {result.warnings?.length > 0 && (
                <div className="border-l-4 border-yellow-500 bg-yellow-50 p-4 text-sm" data-testid="result-warnings">
                  <div className="font-display font-bold text-yellow-900 mb-2 flex items-center gap-2">
                    <WarningCircle size={16} weight="fill" />
                    Field note
                  </div>
                  <ul className="space-y-1 text-yellow-800">
                    {result.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}

              <div className="text-xs text-zinc-400">
                Calculated {new Date(result.calculated_at).toLocaleString()} · {result.rule}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
