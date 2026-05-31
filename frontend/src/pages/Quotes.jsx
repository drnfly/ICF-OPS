import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { toast } from "sonner";
import { Sparkle, FileText, Trophy, Upload, Trash, ScalesIcon } from "@phosphor-icons/react";

export default function Quotes() {
  const [vendors, setVendors] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [text, setText] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [compareIds, setCompareIds] = useState([]);
  const [compareResult, setCompareResult] = useState(null);
  const [comparing, setComparing] = useState(false);

  async function load() {
    const [v, q] = await Promise.all([api.get("/vendors"), api.get("/quotes")]);
    setVendors(v.data);
    setQuotes(q.data);
  }
  useEffect(() => { load(); }, []);

  async function submitQuote(e) {
    e.preventDefault();
    if (!file && text.trim().length < 30) {
      toast.error("Paste at least a paragraph of quote text or attach a PDF");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      if (text.trim()) fd.append("text", text.trim());
      if (vendorId) fd.append("vendor_id", vendorId);
      if (file) fd.append("file", file);
      const { data } = await api.post("/quotes", fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`Analyzed: ${data.vendor_name || "quote"}`);
      setText(""); setFile(null); setVendorId("");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  }

  async function removeQuote(q) {
    if (!confirm("Delete this quote?")) return;
    await api.delete(`/quotes/${q.id}`);
    setCompareIds((ids) => ids.filter((x) => x !== q.id));
    load();
  }

  function toggleCompare(qid) {
    setCompareIds((ids) => ids.includes(qid) ? ids.filter((x) => x !== qid) : (ids.length < 5 ? [...ids, qid] : ids));
  }

  async function runCompare() {
    if (compareIds.length < 2) { toast.error("Pick at least 2 quotes to compare"); return; }
    setComparing(true);
    setCompareResult(null);
    try {
      const { data } = await api.post("/quotes/compare", { quote_ids: compareIds });
      setCompareResult(data);
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Compare failed");
    } finally { setComparing(false); }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="quotes-page">
      <div className="mb-6">
        <div className="label-eyebrow flex items-center gap-2"><Sparkle size={12} weight="fill" className="text-orange-600" />AI · Gemini 3 Flash</div>
        <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Quote Analyzer</h1>
        <p className="text-zinc-500 mt-1 text-sm max-w-2xl">Upload a vendor PDF or paste quote text. AI extracts line items, totals, freight, terms, and flags hidden fees. Pick 2-5 and run a side-by-side compare with a winner recommendation.</p>
      </div>

      <div className="grid lg:grid-cols-5 gap-6">
        {/* Upload form */}
        <form onSubmit={submitQuote} className="lg:col-span-2 border border-zinc-200 bg-white p-6 self-start space-y-4" data-testid="quote-form">
          <div className="flex items-center gap-2"><FileText size={20} className="text-orange-600" weight="fill" /><h2 className="font-display font-bold text-xl">Add a quote</h2></div>
          <div>
            <Label className="label-eyebrow">Vendor (optional)</Label>
            <Select value={vendorId || "none"} onValueChange={(v) => setVendorId(v === "none" ? "" : v)}>
              <SelectTrigger className="rounded-sm mt-1" data-testid="q-vendor"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Auto-detect from text —</SelectItem>
                {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="label-eyebrow">Paste quote text</Label>
            <Textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} className="rounded-sm mt-1 font-mono text-xs" placeholder="Paste full quote text here…" data-testid="q-text" />
          </div>
          <div>
            <Label className="label-eyebrow">Or attach a PDF</Label>
            <Input type="file" accept=".pdf" onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="rounded-sm mt-1 cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-sm file:border-0 file:bg-zinc-900 file:text-white file:font-display file:text-xs file:uppercase file:tracking-wider hover:file:bg-zinc-800"
              data-testid="q-file" />
            {file && <div className="text-xs text-zinc-500 mt-1 font-mono">{file.name} · {(file.size / 1024).toFixed(1)} KB</div>}
          </div>
          <Button type="submit" disabled={busy} data-testid="q-submit"
            className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display font-bold uppercase tracking-wider gap-2">
            <Sparkle size={14} weight="bold" />{busy ? "Analyzing with Gemini…" : "Analyze quote"}
          </Button>
        </form>

        {/* Quotes list + compare */}
        <div className="lg:col-span-3 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-display font-bold text-xl">{quotes.length} analyzed quote{quotes.length !== 1 ? "s" : ""}</div>
            <Button onClick={runCompare} disabled={compareIds.length < 2 || comparing}
              data-testid="compare-btn"
              className="bg-zinc-900 hover:bg-zinc-800 text-white rounded-sm font-display uppercase tracking-wider gap-2">
              <ScalesIcon size={14} weight="bold" />{comparing ? "Comparing…" : `Compare ${compareIds.length || ""}`}
            </Button>
          </div>

          {compareResult && (
            <div className="border-l-4 border-orange-600 bg-orange-50 p-4 space-y-3" data-testid="compare-result">
              <div className="flex items-center gap-2">
                <Trophy size={20} weight="fill" className="text-orange-600" />
                <div className="font-display font-black text-2xl">Winner: {compareResult.comparison?.winner || "—"}</div>
              </div>
              <div className="text-sm text-zinc-800">{compareResult.comparison?.reason}</div>
              {compareResult.comparison?.risks?.length > 0 && (
                <div className="text-xs">
                  <div className="label-eyebrow text-red-700 mb-1">Risks</div>
                  <ul className="list-disc ml-5 text-zinc-700 space-y-0.5">
                    {compareResult.comparison.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {compareResult.comparison?.ranking?.length > 0 && (
                <div className="space-y-1.5">
                  {compareResult.comparison.ranking.map((r, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <div className="font-display font-bold text-zinc-900 min-w-[80px]">{r.score}/100</div>
                      <div className="flex-1">
                        <div className="font-display font-medium">{r.vendor}</div>
                        <div className="text-xs text-zinc-600">{r.why}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {quotes.length === 0 ? (
            <div className="border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
              <FileText size={48} className="mx-auto mb-3 text-zinc-300" weight="duotone" />
              No quotes yet. Paste one to see Gemini extract the line items.
            </div>
          ) : quotes.map((q) => {
            const a = q.analysis || {};
            const checked = compareIds.includes(q.id);
            return (
              <div key={q.id} className={`border ${checked ? "border-orange-500 ring-1 ring-orange-500" : "border-zinc-200"} bg-white p-4`} data-testid={`quote-card-${q.id}`}>
                <div className="flex items-start gap-3">
                  <input type="checkbox" checked={checked} onChange={() => toggleCompare(q.id)}
                    className="mt-1.5 w-4 h-4 accent-orange-600"
                    data-testid={`q-check-${q.id}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-display font-bold text-lg text-zinc-900">
                        {q.vendor_name || a.vendor_guess || "Unknown vendor"}
                      </div>
                      <div className="flex items-center gap-3 text-sm">
                        <div className="font-mono font-bold text-zinc-900">
                          {a.grand_total != null ? `$${Number(a.grand_total).toLocaleString()}` : "—"}
                        </div>
                        <button onClick={() => removeQuote(q)} className="p-1.5 hover:bg-red-100 text-red-700 rounded-sm" data-testid={`q-del-${q.id}`}><Trash size={14} /></button>
                      </div>
                    </div>
                    <div className="text-xs text-zinc-600 mt-1 flex flex-wrap gap-x-4 gap-y-0.5 font-mono">
                      {a.freight != null && <span>freight ${a.freight}</span>}
                      {a.lead_time_days != null && <span>lead {a.lead_time_days}d</span>}
                      {a.freight_terms && <span>{a.freight_terms}</span>}
                      {a.expiration_date && <span>expires {a.expiration_date}</span>}
                      <span>{(a.line_items || []).length} line items</span>
                    </div>
                    {a.summary && <div className="text-sm text-zinc-700 mt-2 leading-relaxed">{a.summary}</div>}
                    {a.warnings?.length > 0 && (
                      <div className="mt-2 border-l-2 border-yellow-500 bg-yellow-50 px-2 py-1 text-xs text-yellow-800">
                        {a.warnings.map((w, i) => <div key={i}>⚠︎ {w}</div>)}
                      </div>
                    )}
                    {a.line_items?.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs font-display uppercase tracking-wider text-zinc-600 cursor-pointer hover:text-orange-700">Line items</summary>
                        <table className="w-full text-xs mt-1">
                          <tbody>{a.line_items.map((li, i) => (
                            <tr key={i} className="border-b border-zinc-100 last:border-0">
                              <td className="py-1 text-zinc-800">{li.description}</td>
                              <td className="py-1 text-right font-mono text-zinc-600">{li.quantity} {li.unit || ""}</td>
                              <td className="py-1 text-right font-mono text-zinc-700">@ ${li.unit_price}</td>
                              <td className="py-1 text-right font-mono font-bold text-zinc-900">${li.line_total}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </details>
                    )}
                    {a.parse_error && <div className="text-xs text-red-600 mt-1">AI returned unstructured output — raw text saved.</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
