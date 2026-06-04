import React, { useState, useMemo } from "react";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Cube, Ruler, Stack, Plus, Minus, ArrowsLeftRight, Trash, Square, GridFour } from "@phosphor-icons/react";

/* ---------- dimension helpers (feet-inch-sixteenths) ---------- */
const FRACTIONS = Array.from({ length: 16 }, (_, i) => {
  if (i === 0) return { label: "0", val: 0 };
  let n = i, d = 16;
  const g = gcd(n, d);
  return { label: `${n / g}/${d / g}`, val: i / 16 };
});

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

function dimToInches(d) {
  return (Number(d.ft) || 0) * 12 + (Number(d.inch) || 0) + (Number(d.frac) || 0);
}
function dimToFeet(d) { return dimToInches(d) / 12; }

function fmtFtIn(totalInches) {
  if (!isFinite(totalInches)) return "—";
  const neg = totalInches < 0;
  let t = Math.round(Math.abs(totalInches) * 16) / 16;
  let ft = Math.floor(t / 12);
  let rem = t - ft * 12;
  let whole = Math.floor(rem);
  let six = Math.round((rem - whole) * 16);
  if (six === 16) { whole += 1; six = 0; }
  if (whole === 12) { ft += 1; whole = 0; }
  let frac = "";
  if (six > 0) { const g = gcd(six, 16); frac = ` ${six / g}/${16 / g}`; }
  return `${neg ? "-" : ""}${ft}' ${whole}${frac}"`;
}

const EMPTY_DIM = { ft: "", inch: "", frac: 0 };

/* ---------- reusable dimension input (ft / in / fraction) ---------- */
function DimInput({ value, onChange, testid }) {
  return (
    <div className="flex items-end gap-2" data-testid={testid}>
      <div className="flex-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-display">ft</span>
        <Input type="number" min="0" value={value.ft}
          onChange={(e) => onChange({ ...value, ft: e.target.value })}
          className="rounded-sm h-10" data-testid={testid ? `${testid}-ft` : undefined} />
      </div>
      <div className="flex-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-display">in</span>
        <Input type="number" min="0" max="11" value={value.inch}
          onChange={(e) => onChange({ ...value, inch: e.target.value })}
          className="rounded-sm h-10" data-testid={testid ? `${testid}-in` : undefined} />
      </div>
      <div className="w-24">
        <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-display">frac</span>
        <Select value={String(value.frac)} onValueChange={(v) => onChange({ ...value, frac: Number(v) })}>
          <SelectTrigger className="rounded-sm h-10" data-testid={testid ? `${testid}-frac` : undefined}><SelectValue /></SelectTrigger>
          <SelectContent>{FRACTIONS.map((f) => <SelectItem key={f.label} value={String(f.val)}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Stat({ label, value, unit, accent, testid }) {
  return (
    <div className={`border ${accent ? "border-orange-600 bg-orange-50" : "border-zinc-200 bg-white"} p-4`} data-testid={testid}>
      <div className="label-eyebrow">{label}</div>
      <div className="font-display font-black text-3xl tracking-tight text-zinc-900 leading-none mt-2">
        {value}{unit && <span className="text-base text-zinc-500 ml-1.5 font-medium">{unit}</span>}
      </div>
    </div>
  );
}

const num = (v, d = 2) => (isFinite(v) ? Number(v).toLocaleString(undefined, { maximumFractionDigits: d }) : "—");

/* ===================== TAB 1 — ICF WALL CONCRETE ===================== */
function ConcreteTab() {
  const [length, setLength] = useState({ ...EMPTY_DIM });
  const [height, setHeight] = useState({ ...EMPTY_DIM });
  const [core, setCore] = useState("6");
  const [customCore, setCustomCore] = useState("");
  const [waste, setWaste] = useState("5");

  const r = useMemo(() => {
    const L = dimToFeet(length);
    const H = dimToFeet(height);
    const coreIn = core === "custom" ? Number(customCore) || 0 : Number(core);
    const cf = L * H * (coreIn / 12);
    const factor = 1 + (Number(waste) || 0) / 100;
    return { cf, cy: cf / 27, cfW: cf * factor, cyW: (cf * factor) / 27, L, H, coreIn };
  }, [length, height, core, customCore, waste]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4 border border-zinc-200 bg-white p-5">
        <div><Label className="label-eyebrow">Wall length</Label><DimInput value={length} onChange={setLength} testid="cc-length" /></div>
        <div><Label className="label-eyebrow">Wall height</Label><DimInput value={height} onChange={setHeight} testid="cc-height" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="label-eyebrow">Core thickness</Label>
            <Select value={core} onValueChange={setCore}>
              <SelectTrigger className="rounded-sm mt-1" data-testid="cc-core"><SelectValue /></SelectTrigger>
              <SelectContent>{["4", "6", "8", "10", "12"].map((c) => <SelectItem key={c} value={c}>{c}"</SelectItem>)}<SelectItem value="custom">Custom…</SelectItem></SelectContent>
            </Select>
          </div>
          {core === "custom" && (
            <div><Label className="label-eyebrow">Custom (in)</Label><Input type="number" value={customCore} onChange={(e) => setCustomCore(e.target.value)} className="rounded-sm mt-1" data-testid="cc-core-custom" /></div>
          )}
          <div><Label className="label-eyebrow">Waste %</Label><Input type="number" value={waste} onChange={(e) => setWaste(e.target.value)} className="rounded-sm mt-1" data-testid="cc-waste" /></div>
        </div>
        <p className="text-xs text-zinc-500">Concrete fills the ICF core only: length × height × core thickness.</p>
      </div>
      <div className="space-y-3">
        <Stat label="Concrete needed (with waste)" value={num(r.cyW)} unit="cu yd" accent testid="cc-result-cy" />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Cubic feet (w/ waste)" value={num(r.cfW, 1)} unit="ft³" testid="cc-result-cf" />
          <Stat label="Net (no waste)" value={num(r.cy)} unit="cu yd" testid="cc-result-net" />
        </div>
        <div className="text-xs text-zinc-400">{fmtFtIn(r.L * 12)} × {fmtFtIn(r.H * 12)} × {r.coreIn}" core</div>
      </div>
    </div>
  );
}

/* ===================== TAB 2 — FT-IN <-> DECIMAL ===================== */
function ConvertTab() {
  const [dim, setDim] = useState({ ...EMPTY_DIM });
  const [dec, setDec] = useState("");

  const inches = dimToInches(dim);
  const decFromDim = inches / 12;
  const decNum = Number(dec);
  const ftInFromDec = isFinite(decNum) ? fmtFtIn(decNum * 12) : "—";

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4 border border-zinc-200 bg-white p-5" data-testid="conv-toDec">
        <div className="label-eyebrow">Feet-inch → decimal</div>
        <DimInput value={dim} onChange={setDim} testid="conv-dim" />
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Stat label="Decimal feet" value={num(decFromDim, 4)} unit="ft" accent testid="conv-decimal-ft" />
          <Stat label="Total inches" value={num(inches, 4)} unit="in" testid="conv-total-in" />
        </div>
      </div>
      <div className="space-y-4 border border-zinc-200 bg-white p-5" data-testid="conv-toFtIn">
        <div className="label-eyebrow">Decimal feet → feet-inch</div>
        <div><Label className="text-xs text-zinc-600">Decimal feet</Label><Input type="number" step="0.01" value={dec} onChange={(e) => setDec(e.target.value)} className="rounded-sm mt-1 h-10" placeholder="e.g. 8.75" data-testid="conv-dec-input" /></div>
        <div className="pt-2"><Stat label="Feet-inch (nearest 1/16)" value={ftInFromDec} accent testid="conv-ftin-result" /></div>
      </div>
    </div>
  );
}

/* ===================== TAB 3 — AREA ===================== */
function AreaTab() {
  const [length, setLength] = useState({ ...EMPTY_DIM });
  const [width, setWidth] = useState({ ...EMPTY_DIM });
  const [waste, setWaste] = useState("0");

  const L = dimToFeet(length), W = dimToFeet(width);
  const factor = 1 + (Number(waste) || 0) / 100;
  const sqft = L * W;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4 border border-zinc-200 bg-white p-5">
        <div><Label className="label-eyebrow">Length</Label><DimInput value={length} onChange={setLength} testid="area-length" /></div>
        <div><Label className="label-eyebrow">Width / height</Label><DimInput value={width} onChange={setWidth} testid="area-width" /></div>
        <div className="w-1/2"><Label className="label-eyebrow">Waste %</Label><Input type="number" value={waste} onChange={(e) => setWaste(e.target.value)} className="rounded-sm mt-1" data-testid="area-waste" /></div>
      </div>
      <div className="space-y-3">
        <Stat label="Area (with waste)" value={num(sqft * factor)} unit="ft²" accent testid="area-result" />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Net area" value={num(sqft)} unit="ft²" testid="area-net" />
          <Stat label="Square yards" value={num((sqft * factor) / 9)} unit="yd²" testid="area-sqyd" />
        </div>
      </div>
    </div>
  );
}

/* ===================== TAB 4 — ICF BLOCK COUNT ===================== */
const BLOCK_PRESETS = {
  "Standard 16\" × 48\"": { h: 16, l: 48 },
  "NUDURA 18\" × 96\"": { h: 18, l: 96 },
  "Fox Blocks 16\" × 48\"": { h: 16, l: 48 },
  "Amvic 16\" × 48\"": { h: 16, l: 48 },
  "BuildBlock 16\" × 48\"": { h: 16, l: 48 },
  "Custom": null,
};
function BlocksTab() {
  const [length, setLength] = useState({ ...EMPTY_DIM });
  const [height, setHeight] = useState({ ...EMPTY_DIM });
  const [preset, setPreset] = useState("Standard 16\" × 48\"");
  const [bh, setBh] = useState("16");
  const [bl, setBl] = useState("48");
  const [openings, setOpenings] = useState("0");
  const [waste, setWaste] = useState("5");

  const p = BLOCK_PRESETS[preset];
  const blockH = p ? p.h : Number(bh) || 0;
  const blockL = p ? p.l : Number(bl) || 0;
  const wallArea = dimToFeet(length) * dimToFeet(height);
  const net = Math.max(0, wallArea - (Number(openings) || 0));
  const faceSf = (blockH * blockL) / 144;
  const factor = 1 + (Number(waste) || 0) / 100;
  const blocks = faceSf > 0 ? Math.ceil((net * factor) / faceSf) : 0;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4 border border-zinc-200 bg-white p-5">
        <div><Label className="label-eyebrow">Wall length</Label><DimInput value={length} onChange={setLength} testid="blk-length" /></div>
        <div><Label className="label-eyebrow">Wall height</Label><DimInput value={height} onChange={setHeight} testid="blk-height" /></div>
        <div>
          <Label className="label-eyebrow">Block form</Label>
          <Select value={preset} onValueChange={setPreset}>
            <SelectTrigger className="rounded-sm mt-1" data-testid="blk-preset"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(BLOCK_PRESETS).map((k) => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {preset === "Custom" && (
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="label-eyebrow">Face height (in)</Label><Input type="number" value={bh} onChange={(e) => setBh(e.target.value)} className="rounded-sm mt-1" data-testid="blk-bh" /></div>
            <div><Label className="label-eyebrow">Face length (in)</Label><Input type="number" value={bl} onChange={(e) => setBl(e.target.value)} className="rounded-sm mt-1" data-testid="blk-bl" /></div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="label-eyebrow">Openings (ft²)</Label><Input type="number" value={openings} onChange={(e) => setOpenings(e.target.value)} className="rounded-sm mt-1" data-testid="blk-openings" /></div>
          <div><Label className="label-eyebrow">Waste %</Label><Input type="number" value={waste} onChange={(e) => setWaste(e.target.value)} className="rounded-sm mt-1" data-testid="blk-waste" /></div>
        </div>
      </div>
      <div className="space-y-3">
        <Stat label="ICF blocks needed" value={num(blocks, 0)} unit="ea" accent testid="blk-result" />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Wall area (net)" value={num(net)} unit="ft²" testid="blk-net" />
          <Stat label="Block face area" value={num(faceSf)} unit="ft²" testid="blk-face" />
        </div>
        <div className="text-xs text-zinc-400">Rounded up · includes {waste || 0}% waste · {blockH}" × {blockL}" face</div>
      </div>
    </div>
  );
}

/* ===================== TAB — REBAR TAKEOFF ===================== */
const REBAR_WT = { "#3": 0.376, "#4": 0.668, "#5": 1.043, "#6": 1.502, "#7": 2.044, "#8": 2.670 };
function RebarTab() {
  const [length, setLength] = useState({ ...EMPTY_DIM });
  const [height, setHeight] = useState({ ...EMPTY_DIM });
  const [vSpace, setVSpace] = useState("16");
  const [hSpace, setHSpace] = useState("16");
  const [size, setSize] = useState("#4");
  const [stock, setStock] = useState("20");
  const [waste, setWaste] = useState("10");

  const L = dimToFeet(length), H = dimToFeet(height);
  const vs = Number(vSpace) || 0, hs = Number(hSpace) || 0;
  const vBars = vs > 0 && L > 0 ? Math.floor((L * 12) / vs) + 1 : 0; // vertical bars along length
  const hRows = hs > 0 && H > 0 ? Math.floor((H * 12) / hs) + 1 : 0; // horizontal rows up height
  const lfVert = vBars * H;
  const lfHoriz = hRows * L;
  const factor = 1 + (Number(waste) || 0) / 100;
  const lfTotal = (lfVert + lfHoriz) * factor;
  const wt = lfTotal * (REBAR_WT[size] || 0);
  const stockNum = Number(stock);
  const sticks = stockNum > 0 ? Math.ceil(lfTotal / stockNum) : 0;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4 border border-zinc-200 bg-white p-5">
        <div><Label className="label-eyebrow">Wall length</Label><DimInput value={length} onChange={setLength} testid="rb-length" /></div>
        <div><Label className="label-eyebrow">Wall height</Label><DimInput value={height} onChange={setHeight} testid="rb-height" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label className="label-eyebrow">Vertical spacing (in o.c.)</Label><Input type="number" value={vSpace} onChange={(e) => setVSpace(e.target.value)} className="rounded-sm mt-1" data-testid="rb-vspace" /></div>
          <div><Label className="label-eyebrow">Horizontal spacing (in o.c.)</Label><Input type="number" value={hSpace} onChange={(e) => setHSpace(e.target.value)} className="rounded-sm mt-1" data-testid="rb-hspace" /></div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Label className="label-eyebrow">Bar size</Label>
            <Select value={size} onValueChange={setSize}>
              <SelectTrigger className="rounded-sm mt-1" data-testid="rb-size"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.keys(REBAR_WT).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label className="label-eyebrow">Stock length (ft)</Label><Input type="number" value={stock} onChange={(e) => setStock(e.target.value)} className="rounded-sm mt-1" data-testid="rb-stock" /></div>
          <div><Label className="label-eyebrow">Waste / lap %</Label><Input type="number" value={waste} onChange={(e) => setWaste(e.target.value)} className="rounded-sm mt-1" data-testid="rb-waste" /></div>
        </div>
        <p className="text-xs text-zinc-500">Verticals run full height, horizontals run full length. Waste % covers lap splices &amp; cutoffs.</p>
      </div>
      <div className="space-y-3">
        <Stat label="Total rebar (with waste)" value={num(lfTotal, 0)} unit="lin ft" accent testid="rb-result-lf" />
        <div className="grid grid-cols-2 gap-3">
          <Stat label={`Weight (${size})`} value={num(wt, 0)} unit="lb" testid="rb-result-wt" />
          <Stat label={`Sticks (${stock || 0}')`} value={num(sticks, 0)} unit="ea" testid="rb-result-sticks" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Vertical bars" value={num(vBars, 0)} unit="ea" testid="rb-vbars" />
          <Stat label="Horizontal rows" value={num(hRows, 0)} unit="ea" testid="rb-hrows" />
        </div>
        <div className="text-xs text-zinc-400">{num(lfVert, 0)} lf vert + {num(lfHoriz, 0)} lf horiz · +{waste || 0}% · {num(wt / 2000, 2)} tons</div>
      </div>
    </div>
  );
}

/* ===================== TAB 5 — DIMENSION MATH (Construction Master tape) ===================== */
function DimensionTab() {
  const [entry, setEntry] = useState({ ...EMPTY_DIM });
  const [tape, setTape] = useState([]); // {inches, op}
  const [scale, setScale] = useState("");

  const total = tape.reduce((s, t) => s + (t.op === "-" ? -t.inches : t.inches), 0);
  const add = (op) => {
    const inc = dimToInches(entry);
    if (!inc) return;
    setTape((t) => [...t, { inches: inc, op }]);
    setEntry({ ...EMPTY_DIM });
  };
  const scaleNum = Number(scale);
  const scaledMul = isFinite(scaleNum) && scale !== "" ? total * scaleNum : null;
  const scaledDiv = isFinite(scaleNum) && scaleNum !== 0 && scale !== "" ? total / scaleNum : null;

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="space-y-4 border border-zinc-200 bg-white p-5">
        <div className="label-eyebrow">Add dimensions (feet-inch-fraction)</div>
        <DimInput value={entry} onChange={setEntry} testid="dm-entry" />
        <div className="grid grid-cols-2 gap-3">
          <Button onClick={() => add("+")} data-testid="dm-add" className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-sm font-display uppercase tracking-wider gap-2"><Plus size={14} weight="bold" /> Add</Button>
          <Button onClick={() => add("-")} data-testid="dm-sub" variant="outline" className="rounded-sm font-display uppercase tracking-wider gap-2"><Minus size={14} weight="bold" /> Subtract</Button>
        </div>
        {tape.length > 0 && (
          <div className="border border-zinc-200 max-h-40 overflow-y-auto text-sm" data-testid="dm-tape">
            {tape.map((t, i) => (
              <div key={i} className="flex justify-between px-3 py-1.5 border-b border-zinc-100 font-mono">
                <span>{t.op === "-" ? "−" : "+"} {fmtFtIn(t.inches)}</span>
                <button onClick={() => setTape((tp) => tp.filter((_, idx) => idx !== i))} className="text-red-500 hover:text-red-700"><Trash size={12} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setTape([])} data-testid="dm-clear" className="rounded-sm font-display uppercase tracking-wider text-xs">Clear all</Button>
        </div>
        <div className="pt-2 border-t border-zinc-100">
          <Label className="label-eyebrow">Scale total × / ÷ by</Label>
          <Input type="number" value={scale} onChange={(e) => setScale(e.target.value)} className="rounded-sm mt-1 w-1/2" placeholder="e.g. 4" data-testid="dm-scale" />
        </div>
      </div>
      <div className="space-y-3">
        <Stat label="Running total" value={fmtFtIn(total)} accent testid="dm-total" />
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Decimal feet" value={num(total / 12, 4)} unit="ft" testid="dm-total-ft" />
          <Stat label="Total inches" value={num(total, 4)} unit="in" testid="dm-total-in" />
        </div>
        {scale !== "" && (
          <div className="grid grid-cols-2 gap-3">
            <Stat label={`Total × ${scale}`} value={fmtFtIn(scaledMul ?? 0)} testid="dm-scaled-mul" />
            <Stat label={`Total ÷ ${scale}`} value={scaledDiv != null ? fmtFtIn(scaledDiv) : "—"} testid="dm-scaled-div" />
          </div>
        )}
      </div>
    </div>
  );
}

/* ===================== PAGE ===================== */
export default function Calculator() {
  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="calculator-page">
      <div className="mb-6">
        <div className="label-eyebrow">Field Tools</div>
        <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Construction Calculator</h1>
        <p className="text-zinc-500 mt-1 text-sm max-w-xl">Construction-Master–style dimensional math, concrete & block takeoffs — all in feet-inches-fractions.</p>
      </div>

      <Tabs defaultValue="concrete" className="w-full">
        <TabsList className="bg-zinc-100 rounded-sm flex-wrap h-auto">
          <TabsTrigger value="concrete" className="rounded-sm gap-1.5 data-[state=active]:bg-zinc-900 data-[state=active]:text-white" data-testid="tab-concrete"><Cube size={14} weight="bold" /> ICF Wall Concrete</TabsTrigger>
          <TabsTrigger value="convert" className="rounded-sm gap-1.5 data-[state=active]:bg-zinc-900 data-[state=active]:text-white" data-testid="tab-convert"><ArrowsLeftRight size={14} weight="bold" /> Ft-In ↔ Decimal</TabsTrigger>
          <TabsTrigger value="area" className="rounded-sm gap-1.5 data-[state=active]:bg-zinc-900 data-[state=active]:text-white" data-testid="tab-area"><Square size={14} weight="bold" /> Area</TabsTrigger>
          <TabsTrigger value="blocks" className="rounded-sm gap-1.5 data-[state=active]:bg-zinc-900 data-[state=active]:text-white" data-testid="tab-blocks"><Stack size={14} weight="bold" /> ICF Blocks</TabsTrigger>
          <TabsTrigger value="rebar" className="rounded-sm gap-1.5 data-[state=active]:bg-zinc-900 data-[state=active]:text-white" data-testid="tab-rebar"><GridFour size={14} weight="bold" /> Rebar</TabsTrigger>
          <TabsTrigger value="dimension" className="rounded-sm gap-1.5 data-[state=active]:bg-zinc-900 data-[state=active]:text-white" data-testid="tab-dimension"><Ruler size={14} weight="bold" /> Dimension Math</TabsTrigger>
        </TabsList>
        <TabsContent value="concrete" className="mt-6"><ConcreteTab /></TabsContent>
        <TabsContent value="convert" className="mt-6"><ConvertTab /></TabsContent>
        <TabsContent value="area" className="mt-6"><AreaTab /></TabsContent>
        <TabsContent value="blocks" className="mt-6"><BlocksTab /></TabsContent>
        <TabsContent value="rebar" className="mt-6"><RebarTab /></TabsContent>
        <TabsContent value="dimension" className="mt-6"><DimensionTab /></TabsContent>
      </Tabs>
    </div>
  );
}
