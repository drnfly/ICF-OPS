import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Minus, Package, PencilSimple, Trash, ArrowsClockwise, Upload, ClockCounterClockwise, DownloadSimple, FileCsv } from "@phosphor-icons/react";
import { API_BASE } from "../lib/api";

const CATS = ["strongback", "turnbuckle", "walkboard bracket", "hand rail", "TB extension", "crankup scaffold"];
const CONDS = ["excellent", "good", "fair", "poor", "retired"];

const EMPTY = {
  name: "",
  category: "strongback",
  serial: "",
  condition: "good",
  location: "",
  daily_rate: 0,
  quantity: 1,
  notes: "",
};

const condColors = {
  excellent: "bg-green-100 text-green-800 border-green-300",
  good: "bg-blue-100 text-blue-800 border-blue-300",
  fair: "bg-yellow-100 text-yellow-800 border-yellow-300",
  poor: "bg-orange-100 text-orange-800 border-orange-300",
  retired: "bg-zinc-100 text-zinc-700 border-zinc-300",
};

export default function Equipment() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get("/equipment");
      setItems(data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  }
  function openEdit(item) {
    setEditing(item);
    setForm({ ...item, serial: item.serial || "", location: item.location || "", notes: item.notes || "" });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    try {
      const payload = {
        ...form,
        daily_rate: Number(form.daily_rate),
        quantity: Number(form.quantity),
      };
      if (editing) {
        await api.patch(`/equipment/${editing.id}`, payload);
        toast.success("Equipment updated");
      } else {
        await api.post("/equipment", payload);
        toast.success("Equipment added");
      }
      setOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Save failed");
    }
  }

  async function remove(item) {
    if (!confirm(`Delete ${item.name}?`)) return;
    try {
      await api.delete(`/equipment/${item.id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Delete failed");
    }
  }

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjTarget, setAdjTarget] = useState(null);
  const [adjDelta, setAdjDelta] = useState(1);
  const [adjReason, setAdjReason] = useState("Restock");

  function openAdjust(item, presetDelta) {
    setAdjTarget(item);
    setAdjDelta(presetDelta);
    setAdjReason(presetDelta > 0 ? "Restock" : "Write-off / lost");
    setAdjOpen(true);
  }

  async function quickAdjust(item, delta) {
    // optimistic +1/-1 with single click
    try {
      await api.post(`/equipment/${item.id}/adjust`, { delta, reason: delta > 0 ? "Quick +1" : "Quick -1" });
      toast.success(`${item.name}: ${delta > 0 ? "+" : ""}${delta}`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Adjust failed");
    }
  }

  async function submitAdjust(e) {
    e.preventDefault();
    try {
      await api.post(`/equipment/${adjTarget.id}/adjust`, {
        delta: Number(adjDelta),
        reason: adjReason,
      });
      toast.success(`${adjTarget.name}: ${adjDelta > 0 ? "+" : ""}${adjDelta} units`);
      setAdjOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Adjust failed");
    }
  }

  // ─── CSV import ──────────────────────────────────────────────────────────
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState("create");
  const [importResult, setImportResult] = useState(null);
  const [importing, setImporting] = useState(false);

  async function downloadTemplate() {
    try {
      const res = await api.get("/equipment/template.csv", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "icf-inventory-template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download template");
    }
  }

  async function uploadCsv(e) {
    e.preventDefault();
    if (!importFile) {
      toast.error("Choose a CSV file first");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const { data } = await api.post(`/equipment/import?mode=${importMode}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setImportResult(data);
      const parts = [];
      if (data.created_count > 0) parts.push(`+${data.created_count} created`);
      if (data.updated_count > 0) parts.push(`${data.updated_count} updated`);
      if (data.skipped_count > 0) parts.push(`${data.skipped_count} skipped`);
      if (parts.length) toast.success(parts.join(" · "));
      if (data.error_count > 0) toast.warning(`${data.error_count} error${data.error_count !== 1 ? "s" : ""}`);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  // ─── History ─────────────────────────────────────────────────────────────
  const [histOpen, setHistOpen] = useState(false);
  const [histTarget, setHistTarget] = useState(null);
  const [histLog, setHistLog] = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  async function openHistory(item) {
    setHistTarget(item);
    setHistOpen(true);
    setHistLog([]);
    setHistLoading(true);
    try {
      const { data } = await api.get(`/equipment/${item.id}/history`);
      setHistLog(data);
    } catch (err) {
      toast.error("Failed to load history");
    } finally {
      setHistLoading(false);
    }
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="equipment-page">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow">Inventory</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Equipment</h1>
          <p className="text-zinc-500 mt-1 text-sm">{items.length} SKU{items.length !== 1 ? "s" : ""} · {items.reduce((s, i) => s + i.quantity, 0)} total units · Use <span className="inline-flex items-center gap-0.5 font-mono"><Minus size={10} weight="bold"/> / <Plus size={10} weight="bold"/></span> on a row to quick-adjust stock</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => { setImportResult(null); setImportFile(null); setImportOpen(true); }}
            data-testid="import-csv-btn"
            className="rounded-sm font-display font-semibold uppercase tracking-wider gap-2"
          >
            <Upload size={16} weight="bold" /> Import CSV
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="add-equipment-btn"
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display font-semibold uppercase tracking-wider gap-2">
                <Plus size={16} weight="bold" /> Add Equipment
              </Button>
            </DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader>
              <DialogTitle className="font-display font-bold text-2xl">
                {editing ? "Edit equipment" : "Add equipment"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-3" data-testid="equipment-form">
              <div>
                <Label className="label-eyebrow">Name</Label>
                <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="rounded-sm mt-1" data-testid="eq-name" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="label-eyebrow">Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger className="rounded-sm mt-1" data-testid="eq-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-eyebrow">Condition</Label>
                  <Select value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                    <SelectTrigger className="rounded-sm mt-1" data-testid="eq-condition"><SelectValue /></SelectTrigger>
                    <SelectContent>{CONDS.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-eyebrow">Quantity</Label>
                  <Input type="number" min="1" required value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    className="rounded-sm mt-1" data-testid="eq-quantity" />
                </div>
                <div>
                  <Label className="label-eyebrow">Daily rate $</Label>
                  <Input type="number" step="0.25" min="0" value={form.daily_rate}
                    onChange={(e) => setForm({ ...form, daily_rate: e.target.value })}
                    className="rounded-sm mt-1" data-testid="eq-rate" />
                </div>
                <div>
                  <Label className="label-eyebrow">Serial</Label>
                  <Input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })}
                    className="rounded-sm mt-1" data-testid="eq-serial" />
                </div>
                <div>
                  <Label className="label-eyebrow">Location</Label>
                  <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="rounded-sm mt-1" data-testid="eq-location" />
                </div>
              </div>
              <div>
                <Label className="label-eyebrow">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="rounded-sm mt-1" data-testid="eq-notes" />
              </div>
              <Button type="submit" data-testid="eq-submit"
                className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider">
                {editing ? "Save changes" : "Add to inventory"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {loading ? (
        <div className="text-zinc-500 text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
          <Package size={48} className="mx-auto mb-3 text-zinc-300" weight="duotone" />
          No equipment yet. Add your first item.
        </div>
      ) : (
        <div className="border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100 sticky top-0">
              <tr>
                {["Name", "Category", "Cond.", "Qty", "Avail.", "Rate/day", "Location", "Actions"].map((h) => (
                  <th key={h} className="text-left p-3 font-display font-bold uppercase tracking-wider text-xs text-zinc-700 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className={i % 2 ? "bg-zinc-50" : "bg-white"} data-testid={`eq-row-${item.id}`}>
                  <td className="p-3 font-display font-medium text-zinc-900">{item.name}</td>
                  <td className="p-3 capitalize text-zinc-700">{item.category}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-display font-semibold border ${condColors[item.condition]}`}>
                      {item.condition}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-zinc-900">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => quickAdjust(item, -1)}
                        className="w-6 h-6 flex items-center justify-center border border-zinc-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700 rounded-sm transition-colors"
                        data-testid={`qty-minus-${item.id}`}
                        aria-label="Decrease quantity"
                        disabled={item.quantity <= 0}
                      >
                        <Minus size={12} weight="bold" />
                      </button>
                      <button
                        onClick={() => openAdjust(item, 0)}
                        className="font-mono font-bold min-w-[2.5rem] text-center hover:bg-zinc-100 rounded-sm px-1.5 py-0.5 transition-colors"
                        data-testid={`qty-bulk-${item.id}`}
                        title="Bulk adjust"
                      >
                        {item.quantity}
                      </button>
                      <button
                        onClick={() => quickAdjust(item, 1)}
                        className="w-6 h-6 flex items-center justify-center border border-zinc-200 hover:bg-green-50 hover:border-green-300 hover:text-green-700 rounded-sm transition-colors"
                        data-testid={`qty-plus-${item.id}`}
                        aria-label="Increase quantity"
                      >
                        <Plus size={12} weight="bold" />
                      </button>
                    </div>
                  </td>
                  <td className="p-3 font-mono">
                    <span className={item.available === 0 ? "text-red-600 font-bold" : item.available < item.quantity / 2 ? "text-orange-600 font-bold" : "text-green-700"}>
                      {item.available}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-zinc-900">${item.daily_rate}</td>
                  <td className="p-3 text-zinc-600">{item.location || "—"}</td>
                  <td className="p-3 flex gap-1">
                    <button onClick={() => openHistory(item)} className="p-1.5 hover:bg-blue-100 text-blue-700 rounded-sm" data-testid={`history-${item.id}`} aria-label="History" title="Stock history">
                      <ClockCounterClockwise size={14} />
                    </button>
                    <button onClick={() => openAdjust(item, 1)} className="p-1.5 hover:bg-orange-100 text-orange-700 rounded-sm" data-testid={`adjust-${item.id}`} aria-label="Adjust stock" title="Bulk adjust stock">
                      <ArrowsClockwise size={14} />
                    </button>
                    <button onClick={() => openEdit(item)} className="p-1.5 hover:bg-zinc-100 rounded-sm" data-testid={`edit-${item.id}`} aria-label="Edit">
                      <PencilSimple size={14} />
                    </button>
                    <button onClick={() => remove(item)} className="p-1.5 hover:bg-red-100 text-red-700 rounded-sm" data-testid={`delete-${item.id}`} aria-label="Delete">
                      <Trash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Bulk adjust dialog */}
      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent className="rounded-sm" data-testid="adjust-dialog">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-2xl">Adjust stock</DialogTitle>
          </DialogHeader>
          {adjTarget && (
            <form onSubmit={submitAdjust} className="space-y-4" data-testid="adjust-form">
              <div className="border border-zinc-200 p-3 bg-zinc-50">
                <div className="label-eyebrow">Item</div>
                <div className="font-display font-medium text-zinc-900 mt-1">{adjTarget.name}</div>
                <div className="text-xs text-zinc-500 mt-1">
                  Current: <span className="font-mono font-bold">{adjTarget.quantity}</span> total ·{" "}
                  <span className="font-mono font-bold">{adjTarget.available}</span> available
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={adjDelta > 0 ? "default" : "outline"}
                  onClick={() => setAdjDelta(Math.abs(Number(adjDelta) || 1))}
                  data-testid="adj-mode-add"
                  className={`rounded-sm font-display uppercase tracking-wider gap-2 ${adjDelta > 0 ? "bg-green-600 hover:bg-green-700 text-white" : ""}`}>
                  <Plus size={14} weight="bold" /> Add stock
                </Button>
                <Button type="button" variant={adjDelta < 0 ? "default" : "outline"}
                  onClick={() => setAdjDelta(-Math.abs(Number(adjDelta) || 1))}
                  data-testid="adj-mode-remove"
                  className={`rounded-sm font-display uppercase tracking-wider gap-2 ${adjDelta < 0 ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}>
                  <Minus size={14} weight="bold" /> Remove
                </Button>
              </div>

              <div>
                <Label className="label-eyebrow">Quantity</Label>
                <Input
                  type="number"
                  required
                  value={Math.abs(adjDelta) || ""}
                  onChange={(e) => {
                    const v = Math.max(0, Number(e.target.value || 0));
                    setAdjDelta(adjDelta < 0 ? -v : v);
                  }}
                  className="rounded-sm mt-1 text-lg font-mono"
                  data-testid="adj-qty"
                  autoFocus
                />
                <div className="text-xs text-zinc-500 mt-2">
                  New total will be:{" "}
                  <span className="font-mono font-bold text-zinc-900">
                    {adjTarget.quantity + Number(adjDelta || 0)}
                  </span>
                </div>
              </div>

              <div>
                <Label className="label-eyebrow">Reason</Label>
                <Select value={adjReason} onValueChange={setAdjReason}>
                  <SelectTrigger className="rounded-sm mt-1" data-testid="adj-reason">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Restock">Restock — bought more</SelectItem>
                    <SelectItem value="Returned from vendor">Returned from vendor</SelectItem>
                    <SelectItem value="Write-off / lost">Write-off / lost</SelectItem>
                    <SelectItem value="Damaged / retired">Damaged / retired</SelectItem>
                    <SelectItem value="Stolen">Stolen</SelectItem>
                    <SelectItem value="Inventory recount">Inventory recount</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setAdjOpen(false)} className="rounded-sm font-display uppercase tracking-wider">
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={!adjDelta || Number(adjDelta) === 0}
                  className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider"
                  data-testid="adj-submit"
                >
                  Apply {adjDelta > 0 ? "+" : ""}{adjDelta || 0}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* CSV Import dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="rounded-sm max-w-lg" data-testid="import-dialog">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-2xl flex items-center gap-2">
              <FileCsv size={24} weight="fill" className="text-orange-600" />
              Import inventory from CSV
            </DialogTitle>
          </DialogHeader>

          {!importResult ? (
            <form onSubmit={uploadCsv} className="space-y-4" data-testid="import-form">
              <div>
                <Label className="label-eyebrow mb-2 block">Import mode</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: "create", label: "Create new", desc: "Add new SKUs · skip duplicates" },
                    { v: "update", label: "Update existing", desc: "Replace fields on matches" },
                    { v: "add", label: "Add to qty", desc: "Increment matched, create rest" },
                  ].map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setImportMode(opt.v)}
                      data-testid={`import-mode-${opt.v}`}
                      className={`text-left p-3 border rounded-sm transition-all ${
                        importMode === opt.v
                          ? "border-orange-600 bg-orange-50 ring-1 ring-orange-600"
                          : "border-zinc-200 bg-white hover:border-zinc-400"
                      }`}
                    >
                      <div className={`font-display font-bold text-xs uppercase tracking-wider ${importMode === opt.v ? "text-orange-700" : "text-zinc-900"}`}>
                        {opt.label}
                      </div>
                      <div className="text-[10px] text-zinc-600 mt-1 leading-tight">{opt.desc}</div>
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-zinc-500 mt-2 leading-snug">
                  Matching: <span className="font-mono">serial</span> first, then case-insensitive <span className="font-mono">name</span>.
                </div>
              </div>

              <div className="border border-zinc-200 bg-zinc-50 p-4 text-sm">
                <div className="label-eyebrow mb-2">Expected columns</div>
                <div className="font-mono text-xs text-zinc-700 leading-relaxed">
                  name, category, condition, location, daily_rate, quantity, serial, notes
                </div>
                <div className="text-xs text-zinc-500 mt-2 leading-relaxed">
                  • <strong>name</strong> + <strong>quantity</strong> required for new rows<br />
                  • For update/add: <strong>serial</strong> or <strong>name</strong> must match an existing SKU<br />
                  • category: strongback, turnbuckle, walkboard bracket, hand rail, TB extension, crankup scaffold<br />
                  • condition: excellent, good, fair, poor, retired
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={downloadTemplate}
                  data-testid="download-template-btn"
                  className="mt-3 rounded-sm font-display uppercase tracking-wider text-xs gap-1.5 h-8"
                >
                  <DownloadSimple size={12} weight="bold" /> Download template
                </Button>
              </div>

              <div>
                <Label className="label-eyebrow">CSV file</Label>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  required
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="rounded-sm mt-1 cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded-sm file:border-0 file:bg-zinc-900 file:text-white file:font-display file:text-xs file:uppercase file:tracking-wider hover:file:bg-zinc-800"
                  data-testid="csv-file-input"
                />
                {importFile && (
                  <div className="text-xs text-zinc-500 mt-1.5 font-mono">
                    {importFile.name} · {(importFile.size / 1024).toFixed(1)} KB
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => setImportOpen(false)} className="rounded-sm font-display uppercase tracking-wider">
                  Cancel
                </Button>
                <Button type="submit" disabled={!importFile || importing} data-testid="import-submit"
                  className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider gap-2">
                  <Upload size={14} weight="bold" />
                  {importing ? "Importing…" : "Import"}
                </Button>
              </DialogFooter>
            </form>
          ) : (
            <div className="space-y-4" data-testid="import-result">
              <div className="grid grid-cols-3 gap-2">
                <div className={`border p-3 ${importResult.created_count > 0 ? "border-green-300 bg-green-50" : "border-zinc-200 bg-zinc-50"}`}>
                  <div className={`label-eyebrow ${importResult.created_count > 0 ? "text-green-700" : ""}`}>Created</div>
                  <div className={`font-display font-black text-3xl mt-1 ${importResult.created_count > 0 ? "text-green-800" : "text-zinc-400"}`}>{importResult.created_count}</div>
                </div>
                <div className={`border p-3 ${importResult.updated_count > 0 ? "border-blue-300 bg-blue-50" : "border-zinc-200 bg-zinc-50"}`}>
                  <div className={`label-eyebrow ${importResult.updated_count > 0 ? "text-blue-700" : ""}`}>Updated</div>
                  <div className={`font-display font-black text-3xl mt-1 ${importResult.updated_count > 0 ? "text-blue-800" : "text-zinc-400"}`}>{importResult.updated_count}</div>
                </div>
                <div className={`border p-3 ${(importResult.skipped_count + importResult.error_count) > 0 ? "border-yellow-300 bg-yellow-50" : "border-zinc-200 bg-zinc-50"}`}>
                  <div className={`label-eyebrow ${(importResult.skipped_count + importResult.error_count) > 0 ? "text-yellow-700" : ""}`}>Skipped / Errors</div>
                  <div className={`font-display font-black text-3xl mt-1 ${(importResult.skipped_count + importResult.error_count) > 0 ? "text-yellow-800" : "text-zinc-400"}`}>
                    {importResult.skipped_count + importResult.error_count}
                  </div>
                </div>
              </div>
              <div className="text-xs text-zinc-500">
                Mode: <span className="font-mono font-semibold text-zinc-900">{importResult.mode}</span>
              </div>
              {(importResult.errors?.length > 0 || importResult.skipped?.length > 0) && (
                <div className="max-h-60 overflow-y-auto border border-zinc-200 text-sm">
                  <table className="w-full">
                    <thead className="bg-zinc-100 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-display font-bold uppercase tracking-wider text-xs">Row</th>
                        <th className="text-left p-2 font-display font-bold uppercase tracking-wider text-xs">Name</th>
                        <th className="text-left p-2 font-display font-bold uppercase tracking-wider text-xs">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importResult.errors?.map((er, idx) => (
                        <tr key={`e${idx}`} className={idx % 2 ? "bg-zinc-50" : ""}>
                          <td className="p-2 font-mono text-zinc-700">{er.row}</td>
                          <td className="p-2 text-zinc-800">{er.name || <em className="text-zinc-400">(blank)</em>}</td>
                          <td className="p-2 text-red-700">{er.error}</td>
                        </tr>
                      ))}
                      {importResult.skipped?.map((sk, idx) => (
                        <tr key={`s${idx}`} className="bg-yellow-50/50">
                          <td className="p-2 font-mono text-zinc-700">{sk.row}</td>
                          <td className="p-2 text-zinc-800">{sk.name || <em className="text-zinc-400">(blank)</em>}</td>
                          <td className="p-2 text-yellow-800">{sk.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <DialogFooter className="gap-2">
                <Button type="button" variant="outline" onClick={() => { setImportResult(null); setImportFile(null); }} className="rounded-sm font-display uppercase tracking-wider" data-testid="import-another">
                  Import another file
                </Button>
                <Button type="button" onClick={() => setImportOpen(false)} className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider" data-testid="import-done">
                  Done
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* History dialog */}
      <Dialog open={histOpen} onOpenChange={setHistOpen}>
        <DialogContent className="rounded-sm max-w-2xl" data-testid="history-dialog">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-2xl flex items-center gap-2">
              <ClockCounterClockwise size={22} weight="fill" className="text-blue-600" />
              Stock history
            </DialogTitle>
          </DialogHeader>
          {histTarget && (
            <>
              <div className="border border-zinc-200 p-3 bg-zinc-50 text-sm flex items-center justify-between">
                <div>
                  <div className="label-eyebrow">Item</div>
                  <div className="font-display font-medium text-zinc-900 mt-1">{histTarget.name}</div>
                </div>
                <div className="text-right">
                  <div className="label-eyebrow">Current qty</div>
                  <div className="font-display font-bold text-2xl text-zinc-900 mt-1">{histTarget.quantity}</div>
                </div>
              </div>

              <div className="max-h-[420px] overflow-y-auto border border-zinc-200">
                {histLoading ? (
                  <div className="p-8 text-center text-zinc-500 text-sm">Loading history…</div>
                ) : histLog.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 text-sm">No history entries yet.</div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-100 sticky top-0">
                      <tr>
                        <th className="text-left p-2.5 font-display font-bold uppercase tracking-wider text-xs">When</th>
                        <th className="text-right p-2.5 font-display font-bold uppercase tracking-wider text-xs">Delta</th>
                        <th className="text-left p-2.5 font-display font-bold uppercase tracking-wider text-xs">Reason</th>
                        <th className="text-left p-2.5 font-display font-bold uppercase tracking-wider text-xs">By</th>
                      </tr>
                    </thead>
                    <tbody>
                      {histLog.map((h, idx) => (
                        <tr key={h.id} className={idx % 2 ? "bg-zinc-50" : ""} data-testid={`hist-row-${h.id}`}>
                          <td className="p-2.5 font-mono text-xs text-zinc-700 whitespace-nowrap">
                            {new Date(h.created_at).toLocaleString()}
                          </td>
                          <td className={`p-2.5 text-right font-mono font-bold ${h.delta > 0 ? "text-green-700" : h.delta < 0 ? "text-red-700" : "text-zinc-700"}`}>
                            {h.delta > 0 ? "+" : ""}{h.delta}
                          </td>
                          <td className="p-2.5 text-zinc-800">{h.reason || "—"}</td>
                          <td className="p-2.5 text-zinc-600 text-xs">{h.user_email || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <DialogFooter>
                <Button type="button" onClick={() => setHistOpen(false)} className="rounded-sm font-display uppercase tracking-wider bg-zinc-900 hover:bg-zinc-800 text-white" data-testid="hist-close">
                  Close
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
