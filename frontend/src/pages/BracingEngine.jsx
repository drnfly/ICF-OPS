import React, { useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { toast } from "sonner";
import { Wrench, WarningCircle, Plus, Trash } from "@phosphor-icons/react";

const emptyRun = () => ({ corners: 4, wall_length_ft: 40, wall_height_ft: 9 });

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
  const [runs, setRuns] = useState([emptyRun()]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  function updateRun(i, k, v) {
    setRuns((rs) => rs.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));
  }
  function addRun() {
    setRuns((rs) => [...rs, emptyRun()]);
  }
  function removeRun(i) {
    setRuns((rs) => (rs.length === 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  async function calculate(e) {
    e?.preventDefault();
    setLoading(true);
    try {
      const payload = {
        runs: runs.map((r) => ({
          corners: Number(r.corners),
          wall_length_ft: Number(r.wall_length_ft),
          wall_height_ft: Number(r.wall_height_ft),
        })),
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
            Add a wall run for each height. <span className="font-display font-semibold text-zinc-700">1 brace per corner + 1 brace every 4 ft of wall</span> — brace length is set by height.
          </p>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* INPUT FORM */}
        <form onSubmit={calculate} className="lg:col-span-2 border border-zinc-200 bg-white p-6 self-start" data-testid="bracing-form">
          <div className="flex items-center gap-2 mb-4">
            <Wrench size={20} weight="fill" className="text-orange-600" />
            <h2 className="font-display font-bold text-xl text-zinc-900">Wall Runs</h2>
          </div>

          <div className="space-y-4">
            {runs.map((r, i) => (
              <div key={i} className="border border-zinc-200 p-4 relative" data-testid={`run-${i}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="label-eyebrow">Run {i + 1}</div>
                  {runs.length > 1 && (
                    <button type="button" onClick={() => removeRun(i)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded-sm" data-testid={`run-remove-${i}`} aria-label="Remove run">
                      <Trash size={14} weight="bold" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-600">Corners</Label>
                    <Input type="number" step="1" min="0" max="500" value={r.corners}
                      onChange={(e) => updateRun(i, "corners", e.target.value)}
                      className="rounded-sm mt-1" data-testid={`run-corners-${i}`} />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-600">Linear ft</Label>
                    <Input type="number" step="1" min="1" max="5000" value={r.wall_length_ft}
                      onChange={(e) => updateRun(i, "wall_length_ft", e.target.value)}
                      className="rounded-sm mt-1" data-testid={`run-length-${i}`} />
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-600">Height ft</Label>
                    <Input type="number" step="0.5" min="1" max="30" value={r.wall_height_ft}
                      onChange={(e) => updateRun(i, "wall_height_ft", e.target.value)}
                      className="rounded-sm mt-1" data-testid={`run-height-${i}`} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button type="button" variant="outline" onClick={addRun} data-testid="add-run-btn"
            className="mt-3 w-full rounded-sm font-display uppercase tracking-wider text-xs gap-2 border-dashed border-zinc-400">
            <Plus size={14} weight="bold" /> Add wall run
          </Button>

          <Button type="submit" disabled={loading} data-testid="bracing-calc-submit"
            className="mt-5 w-full h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display font-bold uppercase tracking-wider transition-colors">
            {loading ? "Calculating…" : "Calculate Braces"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setRuns([emptyRun()]); setResult(null); }}
            className="mt-2 w-full rounded-sm font-display tracking-wider uppercase text-xs" data-testid="bracing-reset-btn">
            Reset
          </Button>
        </form>

        {/* RESULTS */}
        <div className="lg:col-span-3">
          {!result ? (
            <div className="border border-dashed border-zinc-300 bg-zinc-50 grid-paper p-10 text-center min-h-[400px] flex flex-col items-center justify-center">
              <Wrench size={48} className="text-zinc-300 mb-4" weight="duotone" />
              <div className="font-display font-bold text-zinc-700 text-lg">Ready when you are</div>
              <div className="text-sm text-zinc-500 mt-1 max-w-md">
                Add your wall runs and tap <span className="font-display font-semibold text-zinc-900">Calculate</span> to get the total braces and a breakdown by brace length.
              </div>
            </div>
          ) : (
            <div className="space-y-4" data-testid="bracing-result">
              {/* Headline number */}
              <ResultStat label="Total strongbacks needed" value={result.brace_count} unit="ea" big accent testid="result-count" />

              {/* Braces by length — what to order */}
              <div className="border border-zinc-200 bg-white p-5" data-testid="result-by-length">
                <div className="label-eyebrow mb-3">Braces by length — order list</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {result.totals_by_length.map((t, i) => (
                    <div key={i} className="border border-zinc-200 p-3 text-center" data-testid={`length-row-${t.brace_length_ft ?? "over"}`}>
                      <div className="font-display font-black text-3xl text-zinc-900">{t.count}</div>
                      <div className="text-xs text-zinc-500 mt-1 font-mono">
                        {t.brace_length_ft ? `${t.brace_length_ft}' braces` : "over 20' (PE)"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-run breakdown */}
              <div className="border border-zinc-200 bg-white overflow-x-auto" data-testid="result-runs">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-100">
                    <tr>{["Run", "Corners", "Linear ft", "Height", "Corner br.", "Wall br.", "Braces", "Length"].map((h) => (
                      <th key={h} className="text-left p-2.5 font-display font-bold uppercase tracking-wider text-[10px] text-zinc-700 whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {result.runs.map((r, i) => (
                      <tr key={i} className={i % 2 ? "bg-zinc-50" : "bg-white"} data-testid={`result-run-${i}`}>
                        <td className="p-2.5 font-display font-medium text-zinc-900">{i + 1}</td>
                        <td className="p-2.5 font-mono text-zinc-700">{r.corners}</td>
                        <td className="p-2.5 font-mono text-zinc-700">{r.wall_length_ft} ft</td>
                        <td className="p-2.5 font-mono text-zinc-700">{r.wall_height_ft} ft</td>
                        <td className="p-2.5 font-mono text-zinc-700">{r.corner_braces}</td>
                        <td className="p-2.5 font-mono text-zinc-700">{r.wall_braces}</td>
                        <td className="p-2.5 font-mono font-bold text-zinc-900">{r.brace_count}</td>
                        <td className="p-2.5 font-mono text-orange-700 font-semibold">{r.brace_length_ft ? `${r.brace_length_ft}'` : "PE"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-zinc-900 text-white">
                      <td className="p-2.5 font-display font-bold uppercase tracking-wider text-xs" colSpan={6}>Total</td>
                      <td className="p-2.5 font-mono font-bold text-orange-400" colSpan={2}>{result.brace_count} braces</td>
                    </tr>
                  </tfoot>
                </table>
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
                Calculated {new Date(result.calculated_at).toLocaleString()} · {result.rule} · brace length by height (≤10→10′, 10–12→12′, 12–16→16′, 16–20→20′)
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
