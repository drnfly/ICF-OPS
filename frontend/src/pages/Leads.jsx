import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { Plus, CheckSquare, ClipboardText, Trash, PencilSimple } from "@phosphor-icons/react";

const SCOPE_ITEMS = [
  { key: "icf_blocks", label: "ICF blocks", productPlaceholder: "NUDURA Gen 2 / Fox Block / Amvic …" },
  { key: "bracing", label: "Bracing", productPlaceholder: "NUDURA Gen 1+2 strongback, Reachcraft …" },
  { key: "waterproofing", label: "Waterproofing", productPlaceholder: "Peel & stick (e.g. WR Meadows, Tremco) / sheet / spray" },
  { key: "rebar", label: "Rebar", productPlaceholder: "#4 @ 16″ o.c. EW" },
  { key: "concrete", label: "Concrete", productPlaceholder: "Vendor / mix design" },
  { key: "form_accessories", label: "Form accessories", productPlaceholder: "Ties, clips, corners, bucks" },
  { key: "labor", label: "Labor / install", productPlaceholder: "Stack + brace + pour crew" },
  { key: "pump", label: "Concrete pump", productPlaceholder: "Boom pump rental" },
  { key: "other", label: "Other", productPlaceholder: "Anything else in scope" },
];

const STATUSES = ["new", "reviewed", "quoted", "followed_up", "sold", "lost"];
const STATUS_COLORS = {
  new: "bg-blue-100 text-blue-800 border-blue-300",
  reviewed: "bg-purple-100 text-purple-800 border-purple-300",
  quoted: "bg-orange-100 text-orange-800 border-orange-300",
  followed_up: "bg-yellow-100 text-yellow-800 border-yellow-300",
  sold: "bg-green-100 text-green-800 border-green-300",
  lost: "bg-red-100 text-red-800 border-red-300",
};

const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = {
  customer_name: "", company: "", phone: "", email: "", job_site: "",
  estimated_value: 0, status: "new",
  lost_reason: "", lost_notes: "",
  last_review_date: "", next_followup_date: "",
  scope: {}, notes: "",
};

export default function Leads() {
  const [items, setItems] = useState([]);
  const [reasons, setReasons] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  async function load() {
    const [l, r] = await Promise.all([api.get("/leads"), api.get("/leads/lost-reasons")]);
    setItems(l.data);
    setReasons(r.data);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(l) { setEditing(l); setForm({ ...EMPTY, ...l, scope: l.scope || {} }); setOpen(true); }

  function setScope(key, patch) {
    setForm((f) => ({ ...f, scope: { ...f.scope, [key]: { ...(f.scope[key] || {}), ...patch } } }));
  }

  async function submit(e) {
    e.preventDefault();
    try {
      const payload = { ...form, estimated_value: Number(form.estimated_value || 0), email: form.email || null };
      if (editing) await api.patch(`/leads/${editing.id}`, payload);
      else await api.post("/leads", payload);
      toast.success(editing ? "Lead updated" : "Lead added");
      setOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Failed");
    }
  }

  async function remove(l) {
    if (!confirm(`Delete lead ${l.customer_name}?`)) return;
    await api.delete(`/leads/${l.id}`);
    load();
  }

  const counts = STATUSES.reduce((m, s) => ({ ...m, [s]: items.filter((i) => i.status === s).length }), {});

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="leads-page">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow">Sales Pipeline</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Leads & Scope Checklist</h1>
          <p className="text-zinc-500 mt-1 text-sm">Track what you're quoting, what's in / out of scope, and why deals close — or don't.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="add-lead-btn"
              className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider gap-2">
              <Plus size={14} weight="bold" /> New Lead
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="lead-dialog">
            <DialogHeader><DialogTitle className="font-display font-bold text-2xl">{editing ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4" data-testid="lead-form">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="label-eyebrow">Customer *</Label><Input required value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="rounded-sm mt-1" data-testid="ld-customer" /></div>
                <div><Label className="label-eyebrow">Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="rounded-sm mt-1" /></div>
                <div><Label className="label-eyebrow">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-sm mt-1" /></div>
                <div><Label className="label-eyebrow">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-sm mt-1" /></div>
                <div className="col-span-2"><Label className="label-eyebrow">Job site address</Label><Input value={form.job_site} onChange={(e) => setForm({ ...form, job_site: e.target.value })} className="rounded-sm mt-1" /></div>
                <div><Label className="label-eyebrow">Estimated value $</Label><Input type="number" min="0" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} className="rounded-sm mt-1" /></div>
                <div>
                  <Label className="label-eyebrow">Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger className="rounded-sm mt-1" data-testid="ld-status"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label className="label-eyebrow">Last reviewed</Label><Input type="date" value={form.last_review_date} onChange={(e) => setForm({ ...form, last_review_date: e.target.value })} className="rounded-sm mt-1" /></div>
                <div><Label className="label-eyebrow">Next follow-up</Label><Input type="date" value={form.next_followup_date} onChange={(e) => setForm({ ...form, next_followup_date: e.target.value })} className="rounded-sm mt-1" /></div>
              </div>

              {form.status === "lost" && (
                <div className="border-l-4 border-red-500 bg-red-50 p-3 grid grid-cols-2 gap-3" data-testid="lost-block">
                  <div>
                    <Label className="label-eyebrow">Why lost?</Label>
                    <Select value={form.lost_reason || ""} onValueChange={(v) => setForm({ ...form, lost_reason: v })}>
                      <SelectTrigger className="rounded-sm mt-1" data-testid="ld-lost-reason"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{reasons.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label className="label-eyebrow">Lost notes</Label><Input value={form.lost_notes} onChange={(e) => setForm({ ...form, lost_notes: e.target.value })} className="rounded-sm mt-1" /></div>
                </div>
              )}

              {/* Scope checklist */}
              <div>
                <Label className="label-eyebrow mb-2 block flex items-center gap-2"><CheckSquare size={14} className="text-orange-600" weight="bold" />Scope checklist</Label>
                <div className="border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-100">
                      <tr>
                        <th className="text-left p-2 font-display font-bold uppercase tracking-wider text-[10px] text-zinc-700">Item</th>
                        <th className="text-center p-2 font-display font-bold uppercase tracking-wider text-[10px] text-zinc-700 w-24">Providing</th>
                        <th className="text-left p-2 font-display font-bold uppercase tracking-wider text-[10px] text-zinc-700">Product / detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {SCOPE_ITEMS.map((it, idx) => {
                        const s = form.scope[it.key] || {};
                        return (
                          <tr key={it.key} className={idx % 2 ? "bg-zinc-50" : ""} data-testid={`scope-${it.key}`}>
                            <td className="p-2 font-display font-medium text-zinc-900 align-middle">{it.label}</td>
                            <td className="p-2 text-center align-middle">
                              <Switch checked={!!s.providing} onCheckedChange={(v) => setScope(it.key, { providing: v })} data-testid={`scope-toggle-${it.key}`} />
                            </td>
                            <td className="p-2">
                              <Input
                                value={s.product || ""}
                                onChange={(e) => setScope(it.key, { product: e.target.value })}
                                placeholder={it.productPlaceholder}
                                className={`rounded-sm h-8 ${s.providing ? "" : "opacity-50"}`}
                                data-testid={`scope-product-${it.key}`}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-zinc-500 mt-1 leading-snug">
                  Toggle <span className="font-display font-semibold">on</span> what you're quoting and add product specifics. Anything left off is explicitly NOT in your scope (write that on the quote).
                </div>
              </div>

              <div>
                <Label className="label-eyebrow">Notes</Label>
                <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-sm mt-1" />
              </div>

              <DialogFooter>
                <Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider" data-testid="ld-submit">
                  {editing ? "Save" : "Add lead"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Status pills */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-6">
        {STATUSES.map((s) => (
          <div key={s} className={`border p-3 ${STATUS_COLORS[s]}`}>
            <div className="text-[10px] uppercase tracking-wider font-display font-semibold">{s.replace("_", " ")}</div>
            <div className="font-display font-black text-2xl mt-0.5">{counts[s]}</div>
          </div>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
          <ClipboardText size={48} className="mx-auto mb-3 text-zinc-300" weight="duotone" />
          No leads yet.
        </div>
      ) : (
        <div className="border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100">
              <tr>{["Customer", "Status", "Scope", "Est. value", "Last review", "Next f/u", "Lost reason", "Actions"].map((h) => (
                <th key={h} className="text-left p-3 font-display font-bold uppercase tracking-wider text-xs text-zinc-700 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>{items.map((l, i) => {
              const inScope = Object.values(l.scope || {}).filter((s) => s?.providing).length;
              return (
                <tr key={l.id} className={i % 2 ? "bg-zinc-50" : "bg-white"} data-testid={`lead-row-${l.id}`}>
                  <td className="p-3">
                    <div className="font-display font-medium text-zinc-900">{l.customer_name}</div>
                    {l.company && <div className="text-xs text-zinc-500">{l.company}</div>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-display font-semibold border ${STATUS_COLORS[l.status]}`}>
                      {l.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="p-3 font-mono text-zinc-700 text-xs">{inScope} of {SCOPE_ITEMS.length} items</td>
                  <td className="p-3 font-mono text-zinc-900">${(l.estimated_value || 0).toLocaleString()}</td>
                  <td className="p-3 font-mono text-zinc-700 text-xs">{l.last_review_date || "—"}</td>
                  <td className="p-3 font-mono text-zinc-700 text-xs">{l.next_followup_date || "—"}</td>
                  <td className="p-3 text-xs text-zinc-700">
                    {l.status === "lost" ? (l.lost_reason || "—") : "—"}
                  </td>
                  <td className="p-3 flex gap-1">
                    <button onClick={() => openEdit(l)} className="p-1.5 hover:bg-zinc-100 rounded-sm" data-testid={`ld-edit-${l.id}`}><PencilSimple size={14} /></button>
                    <button onClick={() => remove(l)} className="p-1.5 hover:bg-red-100 text-red-700 rounded-sm" data-testid={`ld-del-${l.id}`}><Trash size={14} /></button>
                  </td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
