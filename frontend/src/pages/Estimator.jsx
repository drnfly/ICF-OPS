import React, { useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { useContent } from "../context/ContentContext";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Calculator, Package, Ruler } from "@phosphor-icons/react";

const DEFAULTS = {
  wall_height_ft: 9,
  wall_length_ft: 100,
  core_thickness_in: 6,
  openings_sqft: 0,
  rebar_spacing_in: 16,
  rebar_size: "#4",
  block_face_sqft: 5.33,
};

function ResultStat({ label, value, unit, big, testid }) {
  return (
    <div className="border border-zinc-200 bg-white p-4" data-testid={testid}>
      <div className="label-eyebrow">{label}</div>
      <div className={`font-display font-black ${big ? "text-4xl" : "text-2xl"} tracking-tight text-zinc-900 leading-none mt-2`}>
        {value}
        {unit && <span className="text-base text-zinc-500 ml-1.5 font-medium">{unit}</span>}
      </div>
    </div>
  );
}

export default function Estimator() {
  const { content } = useContent();
  const [form, setForm] = useState({
    ...DEFAULTS,
    rebar_size: ["#3", "#4", "#5", "#6"].includes(content.default_rebar_size) ? content.default_rebar_size : DEFAULTS.rebar_size,
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
      ["wall_height_ft", "wall_length_ft", "core_thickness_in", "openings_sqft", "rebar_spacing_in", "block_face_sqft"]
        .forEach((k) => (payload[k] = Number(payload[k])));
      const { data } = await api.post("/estimator/calculate", payload);
      setResult(data);
      toast.success("BOM generated");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Calculation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="estimator-page">
      <div className="mb-6">
        <div className="label-eyebrow">Take-off · BOM</div>
        <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Quick Estimator</h1>
        <p className="text-zinc-500 mt-1 text-sm">{content.estimator_subtitle}</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        <form onSubmit={calculate} className="lg:col-span-2 border border-zinc-200 bg-white p-6 self-start space-y-4" data-testid="estimator-form">
          <div className="flex items-center gap-2">
            <Ruler size={20} className="text-orange-600" weight="fill" />
            <h2 className="font-display font-bold text-xl">Wall geometry</h2>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="label-eyebrow">Height (ft)</Label>
              <Input type="number" step="0.5" min="1" value={form.wall_height_ft}
                onChange={(e) => update("wall_height_ft", e.target.value)}
                className="rounded-sm mt-1" data-testid="est-height" />
            </div>
            <div>
              <Label className="label-eyebrow">Length (ft)</Label>
              <Input type="number" step="1" min="1" value={form.wall_length_ft}
                onChange={(e) => update("wall_length_ft", e.target.value)}
                className="rounded-sm mt-1" data-testid="est-length" />
            </div>
            <div>
              <Label className="label-eyebrow">Core (in)</Label>
              <Select value={String(form.core_thickness_in)} onValueChange={(v) => update("core_thickness_in", v)}>
                <SelectTrigger className="rounded-sm mt-1" data-testid="est-core"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[4, 6, 8, 10, 12].map((v) => <SelectItem key={v} value={String(v)}>{v}″</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="label-eyebrow">Openings (sqft)</Label>
              <Input type="number" step="1" min="0" value={form.openings_sqft}
                onChange={(e) => update("openings_sqft", e.target.value)}
                className="rounded-sm mt-1" data-testid="est-openings" />
            </div>
            <div>
              <Label className="label-eyebrow">Rebar spacing</Label>
              <Input type="number" step="2" min="8" max="24" value={form.rebar_spacing_in}
                onChange={(e) => update("rebar_spacing_in", e.target.value)}
                className="rounded-sm mt-1" data-testid="est-spacing" />
            </div>
            <div>
              <Label className="label-eyebrow">Rebar size</Label>
              <Select value={form.rebar_size} onValueChange={(v) => update("rebar_size", v)}>
                <SelectTrigger className="rounded-sm mt-1" data-testid="est-rebar-size"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["#3", "#4", "#5", "#6"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label className="label-eyebrow">Block face area (sqft)</Label>
              <Input type="number" step="0.01" min="4" max="12" value={form.block_face_sqft}
                onChange={(e) => update("block_face_sqft", e.target.value)}
                className="rounded-sm mt-1" data-testid="est-block-face" />
              <div className="text-xs text-zinc-500 mt-1">Default 5.33 (16″×48″). Use 10.67 for NUDURA 8′×16″, up to 12 for oversized blocks.</div>
            </div>
          </div>

          <Button type="submit" disabled={loading} data-testid="estimator-submit"
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display font-bold uppercase tracking-wider">
            {loading ? "Calculating…" : "Generate BOM"}
          </Button>
        </form>

        <div className="lg:col-span-3">
          {!result ? (
            <div className="border border-dashed border-zinc-300 bg-zinc-50 grid-paper p-10 text-center min-h-[400px] flex flex-col items-center justify-center">
              <Calculator size={48} className="text-zinc-300 mb-4" weight="duotone" />
              <div className="font-display font-bold text-zinc-700 text-lg">Ready to estimate</div>
              <div className="text-sm text-zinc-500 mt-1">Fill in the wall geometry and we'll spit out a full BOM.</div>
            </div>
          ) : (
            <div className="space-y-4" data-testid="estimator-result">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ResultStat label="Wall area" value={result.wall_area_sqft} unit="sqft" testid="est-r-area" />
                <ResultStat label="ICF blocks" value={result.block_count} unit="ea" big testid="est-r-blocks" />
                <ResultStat label="Concrete" value={result.concrete_cy_with_waste} unit="cy" big testid="est-r-concrete" />
                <ResultStat label="Rebar" value={result.rebar_total_tons} unit="tons" testid="est-r-rebar" />
              </div>

              <div className="border border-zinc-200 bg-white p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Package size={20} className="text-orange-600" weight="fill" />
                  <h3 className="font-display font-bold text-xl">Bill of Materials</h3>
                </div>
                <div className="border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-100">
                      <tr>
                        <th className="text-left p-3 font-display font-bold uppercase tracking-wider text-xs text-zinc-700">Item</th>
                        <th className="text-right p-3 font-display font-bold uppercase tracking-wider text-xs text-zinc-700">Qty</th>
                        <th className="text-left p-3 font-display font-bold uppercase tracking-wider text-xs text-zinc-700 w-20">Unit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.bom.map((row, i) => (
                        <tr key={i} className={i % 2 ? "bg-zinc-50" : ""} data-testid={`bom-row-${i}`}>
                          <td className="p-3 text-zinc-800">{row.item}</td>
                          <td className="p-3 text-right font-mono font-semibold text-zinc-900">{row.quantity}</td>
                          <td className="p-3 text-zinc-500 text-xs uppercase tracking-wider">{row.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 text-xs text-zinc-500">Includes 5% waste on blocks and concrete.</div>
              </div>

              <div className="border border-zinc-200 bg-white p-5 text-sm">
                <div className="label-eyebrow mb-2">Rebar breakdown</div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-xs text-zinc-500">Horizontal</div>
                    <div className="font-display font-bold text-xl text-zinc-900">{result.rebar_horizontal_lf} lf</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Vertical</div>
                    <div className="font-display font-bold text-xl text-zinc-900">{result.rebar_vertical_lf} lf</div>
                  </div>
                  <div>
                    <div className="text-xs text-zinc-500">Weight</div>
                    <div className="font-display font-bold text-xl text-zinc-900">{result.rebar_total_lbs} lbs</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
