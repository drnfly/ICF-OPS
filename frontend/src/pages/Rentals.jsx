import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail, API_BASE } from "../lib/api";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../components/ui/tabs";
import { Switch } from "../components/ui/switch";
import { toast } from "sonner";
import { Plus, Receipt, ArrowUUpLeft, Trash, CalendarPlus, Printer } from "@phosphor-icons/react";

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (d) => {
  const dt = new Date();
  dt.setDate(dt.getDate() + d);
  return dt.toISOString().slice(0, 10);
};

const statusColors = {
  active: "bg-blue-100 text-blue-800 border-blue-300",
  partial: "bg-orange-100 text-orange-800 border-orange-300",
  returned: "bg-green-100 text-green-800 border-green-300",
  lost: "bg-red-100 text-red-800 border-red-300",
  overdue: "bg-red-100 text-red-800 border-red-300",
};

export default function Rentals() {
  const [rentals, setRentals] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [open, setOpen] = useState(false);
  const [retOpen, setRetOpen] = useState(false);
  const [returnTarget, setReturnTarget] = useState(null);
  const [custOpen, setCustOpen] = useState(false);

  const [form, setForm] = useState({
    customer_id: "",
    items: [{ equipment_id: "", quantity: 1 }],
    start_date: today(), due_date: plusDays(14),
    deposit: 0, notes: "",
  });
  const [retForm, setRetForm] = useState({ return_date: today(), condition_on_return: "good", damage_fee: 0, notes: "", items: [] });
  const [custForm, setCustForm] = useState({ name: "", company: "", phone: "", email: "", address: "" });

  async function load() {
    const [r, e, c] = await Promise.all([
      api.get("/rentals"),
      api.get("/equipment"),
      api.get("/customers"),
    ]);
    setRentals(r.data);
    setEquipment(e.data);
    setCustomers(c.data);
  }
  useEffect(() => { load(); }, []);

  function setItem(idx, patch) {
    setForm((f) => ({ ...f, items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)) }));
  }
  function addItem() {
    setForm((f) => ({ ...f, items: [...f.items, { equipment_id: "", quantity: 1 }] }));
  }
  function removeItem(idx) {
    setForm((f) => ({ ...f, items: f.items.length > 1 ? f.items.filter((_, i) => i !== idx) : f.items }));
  }

  function resetForm() {
    setForm({
      customer_id: "",
      items: [{ equipment_id: "", quantity: 1 }],
      start_date: today(), due_date: plusDays(14),
      deposit: 0, notes: "",
    });
  }

  async function createRental(ev) {
    ev.preventDefault();
    const payloadItems = form.items
      .filter((i) => i.equipment_id && Number(i.quantity) > 0)
      .map((i) => ({ equipment_id: i.equipment_id, quantity: Number(i.quantity) }));
    if (payloadItems.length === 0) {
      toast.error("Add at least one SKU");
      return;
    }
    try {
      await api.post("/rentals", {
        customer_id: form.customer_id,
        items: payloadItems,
        start_date: form.start_date,
        due_date: form.due_date,
        deposit: Number(form.deposit),
        notes: form.notes,
      });
      toast.success("Rental created");
      setOpen(false);
      resetForm();
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Failed");
    }
  }

  async function processReturn(ev) {
    ev.preventDefault();
    const items = retForm.items
      .filter((i) => Number(i.quantity) > 0)
      .map((i) => ({ equipment_id: i.equipment_id, quantity: Number(i.quantity) }));
    if (items.length === 0) {
      toast.error("Set a return quantity for at least one item");
      return;
    }
    try {
      await api.post(`/rentals/${returnTarget.id}/return`, {
        return_date: retForm.return_date,
        condition_on_return: retForm.condition_on_return,
        damage_fee: Number(retForm.damage_fee),
        notes: retForm.notes,
        items,
        new_due_date: retForm.extend_due ? retForm.new_due_date : null,
      });
      toast.success("Return processed");
      setRetOpen(false);
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Failed");
    }
  }

  async function createCustomer(ev) {
    ev.preventDefault();
    try {
      await api.post("/customers", custForm);
      toast.success("Customer added");
      setCustOpen(false);
      setCustForm({ name: "", company: "", phone: "", email: "", address: "" });
      load();
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Failed");
    }
  }

  function openReturn(r) {
    setReturnTarget(r);
    setRetForm({
      return_date: today(),
      condition_on_return: "good",
      damage_fee: 0,
      notes: "",
      extend_due: false,
      new_due_date: r.due_date,
      items: (r.items || []).map((it) => ({
        equipment_id: it.equipment_id,
        equipment_name: it.equipment_name,
        outstanding: it.outstanding,
        quantity: it.outstanding,  // default = return everything outstanding
      })),
    });
    setRetOpen(true);
  }

  function setRetItem(idx, patch) {
    setRetForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }));
  }

  const activeRentals = rentals.filter((r) => r.status === "active" || r.status === "partial");
  const closedRentals = rentals.filter((r) => r.status !== "active" && r.status !== "partial");
  const todayStr = today();

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1500px]" data-testid="rentals-page">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow">Rental Ops</div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">Rentals</h1>
          <p className="text-zinc-500 mt-1 text-sm">{activeRentals.length} active · {closedRentals.length} closed</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog open={custOpen} onOpenChange={setCustOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-customer-btn" variant="outline" className="rounded-sm font-display uppercase tracking-wider gap-2">
                <Plus size={14} weight="bold" /> Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm">
              <DialogHeader><DialogTitle className="font-display font-bold text-2xl">New customer</DialogTitle></DialogHeader>
              <form onSubmit={createCustomer} className="space-y-3" data-testid="customer-form">
                <div>
                  <Label className="label-eyebrow">Name *</Label>
                  <Input required value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} className="rounded-sm mt-1" data-testid="cust-name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="label-eyebrow">Company</Label>
                    <Input value={custForm.company} onChange={(e) => setCustForm({ ...custForm, company: e.target.value })} className="rounded-sm mt-1" />
                  </div>
                  <div>
                    <Label className="label-eyebrow">Phone</Label>
                    <Input value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} className="rounded-sm mt-1" />
                  </div>
                  <div>
                    <Label className="label-eyebrow">Email</Label>
                    <Input type="email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} className="rounded-sm mt-1" />
                  </div>
                  <div>
                    <Label className="label-eyebrow">Address</Label>
                    <Input value={custForm.address} onChange={(e) => setCustForm({ ...custForm, address: e.target.value })} className="rounded-sm mt-1" />
                  </div>
                </div>
                <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider" data-testid="cust-submit">Add customer</Button>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button data-testid="new-rental-btn"
                className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider gap-2">
                <Plus size={14} weight="bold" /> New Rental
              </Button>
            </DialogTrigger>
            <DialogContent className="rounded-sm max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-display font-bold text-2xl">New rental</DialogTitle></DialogHeader>
              <form onSubmit={createRental} className="space-y-3" data-testid="rental-form">
                <div>
                  <Label className="label-eyebrow">Customer</Label>
                  <Select value={form.customer_id} onValueChange={(v) => setForm({ ...form, customer_id: v })}>
                    <SelectTrigger className="rounded-sm mt-1" data-testid="rental-customer"><SelectValue placeholder="Select customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="label-eyebrow">Equipment items</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem}
                      disabled={form.items.length >= equipment.length}
                      data-testid="rental-add-item"
                      className="rounded-sm font-display uppercase tracking-wider text-xs gap-1 h-8">
                      <Plus size={12} weight="bold" /> Add SKU
                    </Button>
                  </div>
                  {form.items.map((it, idx) => {
                    const eqSel = equipment.find((e) => e.id === it.equipment_id);
                    return (
                      <div key={idx} className="border border-zinc-200 p-3 rounded-sm bg-zinc-50/40 space-y-2" data-testid={`rental-item-${idx}`}>
                        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-center">
                          <Select value={it.equipment_id} onValueChange={(v) => setItem(idx, { equipment_id: v })}>
                            <SelectTrigger className="rounded-sm" data-testid={`rental-eq-${idx}`}>
                              <SelectValue placeholder="Select equipment" />
                            </SelectTrigger>
                            <SelectContent>
                              {equipment.map((e) => (
                                <SelectItem key={e.id} value={e.id} disabled={e.available === 0}>
                                  {e.name} — {e.available} avail @ ${e.daily_rate}/day
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number" min="1" required
                            value={it.quantity}
                            onChange={(e) => setItem(idx, { quantity: e.target.value })}
                            className="rounded-sm w-24 text-center font-mono"
                            data-testid={`rental-qty-${idx}`}
                            placeholder="qty"
                          />
                          <button
                            type="button"
                            onClick={() => removeItem(idx)}
                            disabled={form.items.length <= 1}
                            className="p-2 hover:bg-red-100 text-red-700 rounded-sm disabled:opacity-30 disabled:cursor-not-allowed"
                            data-testid={`rental-remove-${idx}`}
                            aria-label="Remove SKU"
                          >
                            <Trash size={14} />
                          </button>
                        </div>
                        {eqSel && Number(it.quantity) > eqSel.available && (
                          <div className="text-[11px] text-red-700 pl-1">
                            Only {eqSel.available} available — request exceeds stock
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="label-eyebrow">Deposit $</Label>
                    <Input type="number" min="0" step="1" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: e.target.value })} className="rounded-sm mt-1" data-testid="rental-deposit" />
                  </div>
                  <div />
                  <div>
                    <Label className="label-eyebrow">Start</Label>
                    <Input type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="rounded-sm mt-1" data-testid="rental-start" />
                  </div>
                  <div>
                    <Label className="label-eyebrow">Due</Label>
                    <Input type="date" required value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} className="rounded-sm mt-1" data-testid="rental-due" />
                  </div>
                </div>
                <div>
                  <Label className="label-eyebrow">Notes</Label>
                  <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-sm mt-1" />
                </div>
                <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider" data-testid="rental-submit">
                  Create rental
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="rounded-sm bg-zinc-100 mb-4">
          <TabsTrigger value="active" data-testid="tab-active" className="rounded-sm font-display uppercase tracking-wider text-xs">Active ({activeRentals.length})</TabsTrigger>
          <TabsTrigger value="closed" data-testid="tab-closed" className="rounded-sm font-display uppercase tracking-wider text-xs">Closed ({closedRentals.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <RentalTable rentals={activeRentals} onReturn={openReturn} todayStr={todayStr} />
        </TabsContent>
        <TabsContent value="closed">
          <RentalTable rentals={closedRentals} onReturn={null} todayStr={todayStr} />
        </TabsContent>
      </Tabs>

      {/* Return dialog */}
      <Dialog open={retOpen} onOpenChange={setRetOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader>
            <DialogTitle className="font-display font-bold text-2xl">Return equipment</DialogTitle>
          </DialogHeader>
          {returnTarget && (
            <form onSubmit={processReturn} className="space-y-3" data-testid="return-form">
              <div className="border border-zinc-200 p-3 bg-zinc-50 text-sm">
                <div className="label-eyebrow">Rental</div>
                <div className="font-display font-medium text-zinc-900 mt-1">{returnTarget.items_summary}</div>
                <div className="text-xs text-zinc-500">{returnTarget.customer_name} · due {returnTarget.due_date}</div>
                {returnTarget.status === "partial" && (
                  <div className="text-[10px] uppercase tracking-wider font-display font-semibold text-orange-700 mt-1">
                    Partial — {returnTarget.total_outstanding} units still out
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label className="label-eyebrow">Return per item</Label>
                <div className="border border-zinc-200">
                  <table className="w-full text-sm">
                    <thead className="bg-zinc-100">
                      <tr>
                        <th className="text-left p-2 font-display font-bold uppercase tracking-wider text-[10px] text-zinc-700">Equipment</th>
                        <th className="text-right p-2 font-display font-bold uppercase tracking-wider text-[10px] text-zinc-700">Outstanding</th>
                        <th className="text-right p-2 font-display font-bold uppercase tracking-wider text-[10px] text-zinc-700 w-28">Return qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {retForm.items.map((it, idx) => (
                        <tr key={it.equipment_id} className={idx % 2 ? "bg-zinc-50" : ""} data-testid={`ret-item-${idx}`}>
                          <td className="p-2 text-zinc-900 font-display font-medium">{it.equipment_name}</td>
                          <td className="p-2 text-right font-mono text-zinc-700">{it.outstanding}</td>
                          <td className="p-2">
                            <div className="flex items-center gap-1 justify-end">
                              <Input
                                type="number"
                                min="0"
                                max={it.outstanding}
                                value={it.quantity}
                                onChange={(e) => setRetItem(idx, { quantity: e.target.value })}
                                className="rounded-sm h-8 w-20 text-right font-mono"
                                data-testid={`ret-qty-${idx}`}
                              />
                              <button
                                type="button"
                                onClick={() => setRetItem(idx, { quantity: 0 })}
                                className="text-[10px] uppercase tracking-wider font-display text-zinc-500 hover:text-orange-700 px-1"
                                data-testid={`ret-keep-${idx}`}
                              >
                                keep
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="text-[11px] text-zinc-500 leading-snug">
                  Set qty to <span className="font-mono">0</span> (or click <span className="font-mono">keep</span>) to leave that SKU out on the job. The rental stays open as <span className="font-display font-semibold uppercase tracking-wider text-orange-700">partial</span> until everything comes back.
                </div>
              </div>

              {/* Extend due date when items are being kept */}
              {(() => {
                const willBePartial = retForm.items.some((i) => Number(i.quantity) < i.outstanding);
                if (!willBePartial) return null;
                return (
                  <div className="border border-zinc-200 p-3 rounded-sm bg-orange-50/40" data-testid="extend-due-block">
                    <div className="flex items-center justify-between">
                      <Label className="label-eyebrow flex items-center gap-2 cursor-pointer" htmlFor="extend_due">
                        <CalendarPlus size={14} className="text-orange-600" weight="bold" />
                        Extend due date for remaining items
                      </Label>
                      <Switch
                        id="extend_due"
                        checked={retForm.extend_due}
                        onCheckedChange={(v) => setRetForm({ ...retForm, extend_due: v })}
                        data-testid="ret-extend-toggle"
                      />
                    </div>
                    {retForm.extend_due && (
                      <div className="mt-2 grid grid-cols-[1fr_auto] gap-2 items-end">
                        <div>
                          <Label className="label-eyebrow">New due date</Label>
                          <Input
                            type="date"
                            min={retForm.return_date}
                            required={retForm.extend_due}
                            value={retForm.new_due_date}
                            onChange={(e) => setRetForm({ ...retForm, new_due_date: e.target.value })}
                            className="rounded-sm mt-1"
                            data-testid="ret-new-due"
                          />
                        </div>
                        <div className="text-[11px] text-zinc-500 pb-2">
                          was <span className="font-mono">{returnTarget.due_date}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="label-eyebrow">Return date</Label>
                  <Input type="date" required value={retForm.return_date} onChange={(e) => setRetForm({ ...retForm, return_date: e.target.value })} className="rounded-sm mt-1" data-testid="ret-date" />
                </div>
                <div>
                  <Label className="label-eyebrow">Condition (default)</Label>
                  <Select value={retForm.condition_on_return} onValueChange={(v) => setRetForm({ ...retForm, condition_on_return: v })}>
                    <SelectTrigger className="rounded-sm mt-1" data-testid="ret-cond"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["excellent", "good", "fair", "poor", "damaged", "lost"].map((c) =>
                        <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="label-eyebrow">Damage / loss fee $</Label>
                  <Input type="number" min="0" value={retForm.damage_fee} onChange={(e) => setRetForm({ ...retForm, damage_fee: e.target.value })} className="rounded-sm mt-1" data-testid="ret-fee" />
                </div>
                <div>
                  <Label className="label-eyebrow">Notes</Label>
                  <Input value={retForm.notes} onChange={(e) => setRetForm({ ...retForm, notes: e.target.value })} className="rounded-sm mt-1" />
                </div>
              </div>
              <Button type="submit" className="w-full bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider" data-testid="ret-submit">
                Process return
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RentalTable({ rentals, onReturn, todayStr }) {
  if (rentals.length === 0) {
    return (
      <div className="border border-dashed border-zinc-300 p-10 text-center text-zinc-500">
        <Receipt size={48} className="mx-auto mb-3 text-zinc-300" weight="duotone" />
        No rentals here.
      </div>
    );
  }
  return (
    <div className="border border-zinc-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-zinc-100">
          <tr>
            {["Customer", "Items", "Total qty", "Start", "Due", "Status", "Deposit", "Actions"].map((h) => (
              <th key={h} className="text-left p-3 font-display font-bold uppercase tracking-wider text-xs text-zinc-700 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rentals.map((r, i) => {
            const stillOpen = r.status === "active" || r.status === "partial";
            const isOverdue = stillOpen && r.due_date < todayStr;
            const displayStatus = isOverdue ? "overdue" : r.status;
            const multi = (r.items?.length || 0) > 1;
            return (
              <tr key={r.id} className={i % 2 ? "bg-zinc-50" : "bg-white"} data-testid={`rental-row-${r.id}`}>
                <td className="p-3 font-display font-medium text-zinc-900">{r.customer_name}</td>
                <td className="p-3 text-zinc-700">
                  {multi ? (
                    <details className="cursor-pointer">
                      <summary className="font-display font-medium text-zinc-900 hover:text-orange-600">
                        {r.items_summary}
                      </summary>
                      <ul className="mt-1 ml-4 text-xs space-y-0.5">
                        {(r.items || []).map((it, idx) => (
                          <li key={idx} className="text-zinc-600">
                            <span className="text-zinc-900">{it.equipment_name || "—"}</span> × <span className="font-mono">{it.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : (
                    <span>{r.items_summary}</span>
                  )}
                </td>
                <td className="p-3 font-mono text-zinc-900">{r.total_quantity}</td>
                <td className="p-3 font-mono text-zinc-700">{r.start_date}</td>
                <td className={`p-3 font-mono ${isOverdue ? "text-red-600 font-bold" : "text-zinc-700"}`}>{r.due_date}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 text-[10px] uppercase tracking-wider font-display font-semibold border ${statusColors[displayStatus] || statusColors.active}`}>
                    {displayStatus}
                  </span>
                </td>
                <td className="p-3 font-mono text-zinc-900">${r.deposit}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" data-testid={`ticket-${r.id}`}
                      onClick={() => window.open(`${API_BASE}/rentals/${r.id}/ticket.pdf`, "_blank")}
                      title="Open printable delivery ticket (print or save as PDF)"
                      className="rounded-sm font-display uppercase tracking-wider text-xs gap-1 h-8 border-zinc-900 text-zinc-900 hover:bg-zinc-900 hover:text-white">
                      <Printer size={12} weight="bold" /> Ticket
                    </Button>
                    {onReturn && (
                      <Button size="sm" variant="outline" onClick={() => onReturn(r)} data-testid={`return-${r.id}`}
                        className="rounded-sm font-display uppercase tracking-wider text-xs gap-1 h-8">
                        <ArrowUUpLeft size={12} weight="bold" /> Return
                      </Button>
                    )}
                    {!onReturn && r.condition_on_return && (
                      <span className="text-xs text-zinc-500 capitalize">→ {r.condition_on_return}</span>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
