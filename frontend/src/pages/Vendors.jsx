import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "../components/ui/dialog";
import { toast } from "sonner";
import { Plus, Truck, PencilSimple, Trash } from "@phosphor-icons/react";

const EMPTY = {
  name: "", contact_name: "", phone: "", email: "", address: "",
  categories: [], freight_terms: "FOB Origin",
  units_per_truck: "", capacity_unit: "blocks",
  freight_cost_per_truck: "", lead_time_days: "",
  min_order_for_free_freight: "", notes: "",
};

const TERMS = ["FOB Origin", "FOB Destination", "Prepaid + Add", "Collect", "Other"];
const UNITS = ["blocks", "lbs", "pallets", "sqft"];

export default function Vendors() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);

  async function load() {
    const { data } = await api.get("/vendors");
    setItems(data);
  }
  useEffect(() => { load(); }, []);

  function openCreate() { setEditing(null); setForm(EMPTY); setOpen(true); }
  function openEdit(v) {
    setEditing(v);
    setForm({
      ...EMPTY, ...v,
      categories: v.categories || [],
      units_per_truck: v.units_per_truck ?? "",
      freight_cost_per_truck: v.freight_cost_per_truck ?? "",
      lead_time_days: v.lead_time_days ?? "",
      min_order_for_free_freight: v.min_order_for_free_freight ?? "",
    });
    setOpen(true);
  }

  async function submit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      categories: typeof form.categories === "string"
        ? form.categories.split(",").map((s) => s.trim()).filter(Boolean)
        : form.categories,
      units_per_truck: form.units_per_truck === "" ? null : Number(form.units_per_truck),
      freight_cost_per_truck: form.freight_cost_per_truck === "" ? null : Number(form.freight_cost_per_truck),
      lead_time_days: form.lead_time_days === "" ? null : Number(form.lead_time_days),
      min_order_for_free_freight: form.min_order_for_free_freight === "" ? null : Number(form.min_order_for_free_freight),
      email: form.email || null,
    };
    try {
      if (editing) await api.patch(`/vendors/${editing.id}`, payload);
      else await api.post("/vendors", payload);
      toast.success(editing ? "Vendor updated" : "Vendor added");
      setOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Failed");
    }
  }

  async function remove(v) {
    if (!confirm(`Delete vendor ${v.name}?`)) return;
    await api.delete(`/vendors/${v.id}`);
    toast.success("Deleted");
    load();
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="vendors-page">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow">Supply Chain</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Vendors</h1>
          <p className="text-zinc-500 mt-1 text-sm">ICF block suppliers, freight terms, and per-truck capacity.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="add-vendor-btn"
              className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider gap-2">
              <Plus size={14} weight="bold" /> Add Vendor
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle className="font-display font-bold text-2xl">{editing ? "Edit vendor" : "New vendor"}</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-3" data-testid="vendor-form">
              <div className="grid grid-cols-2 gap-3">
                <div><Label className="label-eyebrow">Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm mt-1" data-testid="vd-name" /></div>
                <div><Label className="label-eyebrow">Contact</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} className="rounded-sm mt-1" /></div>
                <div><Label className="label-eyebrow">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="rounded-sm mt-1" /></div>
                <div><Label className="label-eyebrow">Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-sm mt-1" /></div>
                <div className="col-span-2"><Label className="label-eyebrow">Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="rounded-sm mt-1" /></div>
                <div className="col-span-2">
                  <Label className="label-eyebrow">Categories / brands they supply</Label>
                  <Input
                    value={Array.isArray(form.categories) ? form.categories.join(", ") : form.categories}
                    onChange={(e) => setForm({ ...form, categories: e.target.value })}
                    className="rounded-sm mt-1"
                    placeholder="NUDURA, Fox Block, Amvic …"
                  />
                  <div className="text-[11px] text-zinc-500 mt-0.5">Comma-separated</div>
                </div>
                <div>
                  <Label className="label-eyebrow">Freight terms</Label>
                  <Select value={form.freight_terms || ""} onValueChange={(v) => setForm({ ...form, freight_terms: v })}>
                    <SelectTrigger className="rounded-sm mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{TERMS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-eyebrow">Lead time (days)</Label>
                  <Input type="number" min="0" value={form.lead_time_days} onChange={(e) => setForm({ ...form, lead_time_days: e.target.value })} className="rounded-sm mt-1" />
                </div>
                <div>
                  <Label className="label-eyebrow">Per-truck capacity</Label>
                  <Input type="number" min="0" value={form.units_per_truck} onChange={(e) => setForm({ ...form, units_per_truck: e.target.value })} className="rounded-sm mt-1" data-testid="vd-cap" />
                </div>
                <div>
                  <Label className="label-eyebrow">Capacity unit</Label>
                  <Select value={form.capacity_unit} onValueChange={(v) => setForm({ ...form, capacity_unit: v })}>
                    <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-eyebrow">Freight $/truck</Label>
                  <Input type="number" min="0" step="1" value={form.freight_cost_per_truck} onChange={(e) => setForm({ ...form, freight_cost_per_truck: e.target.value })} className="rounded-sm mt-1" data-testid="vd-freight" />
                </div>
                <div>
                  <Label className="label-eyebrow">Min order for free freight $</Label>
                  <Input type="number" min="0" value={form.min_order_for_free_freight} onChange={(e) => setForm({ ...form, min_order_for_free_freight: e.target.value })} className="rounded-sm mt-1" />
                </div>
                <div className="col-span-2"><Label className="label-eyebrow">Notes</Label><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-sm mt-1" /></div>
              </div>
              <DialogFooter><Button type="submit" className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider" data-testid="vd-submit">{editing ? "Save" : "Add"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
          <Truck size={48} className="mx-auto mb-3 text-zinc-300" weight="duotone" />
          No vendors yet.
        </div>
      ) : (
        <div className="border border-zinc-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-100">
              <tr>{["Vendor", "Categories", "Terms", "Truck cap.", "Freight $/truck", "Lead", "Contact", "Actions"].map((h) => (
                <th key={h} className="text-left p-3 font-display font-bold uppercase tracking-wider text-xs text-zinc-700 whitespace-nowrap">{h}</th>
              ))}</tr>
            </thead>
            <tbody>{items.map((v, i) => (
              <tr key={v.id} className={i % 2 ? "bg-zinc-50" : "bg-white"} data-testid={`vendor-row-${v.id}`}>
                <td className="p-3 font-display font-medium text-zinc-900">{v.name}</td>
                <td className="p-3 text-zinc-700 text-xs">{(v.categories || []).join(", ") || "—"}</td>
                <td className="p-3 text-zinc-700 text-xs">{v.freight_terms || "—"}</td>
                <td className="p-3 font-mono text-zinc-900">{v.units_per_truck ? `${v.units_per_truck} ${v.capacity_unit}` : "—"}</td>
                <td className="p-3 font-mono text-zinc-900">{v.freight_cost_per_truck ? `$${v.freight_cost_per_truck}` : "—"}</td>
                <td className="p-3 font-mono text-zinc-700">{v.lead_time_days ? `${v.lead_time_days}d` : "—"}</td>
                <td className="p-3 text-xs text-zinc-600">
                  {v.contact_name || "—"}{v.phone ? <><br />{v.phone}</> : null}
                </td>
                <td className="p-3 flex gap-1">
                  <button onClick={() => openEdit(v)} className="p-1.5 hover:bg-zinc-100 rounded-sm" data-testid={`vd-edit-${v.id}`}><PencilSimple size={14} /></button>
                  <button onClick={() => remove(v)} className="p-1.5 hover:bg-red-100 text-red-700 rounded-sm" data-testid={`vd-del-${v.id}`}><Trash size={14} /></button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
