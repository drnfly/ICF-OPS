import React, { useEffect, useState } from "react";
import { api, formatApiErrorDetail } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useContent } from "../context/ContentContext";
import { Navigate } from "react-router-dom";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Button } from "../components/ui/button";
import { Textarea } from "../components/ui/textarea";
import { toast } from "sonner";
import { Shield, FloppyDisk, ArrowCounterClockwise } from "@phosphor-icons/react";

const SECTIONS = [
  {
    key: "brand",
    title: "Brand",
    description: "Logo text and tagline shown in the header and login screen.",
    fields: [
      { k: "brand_name", label: "Brand name", hint: "Header logo · max 18 chars" },
      { k: "brand_tagline", label: "Brand tagline", hint: "Small text under the logo" },
    ],
  },
  {
    key: "login",
    title: "Login page · marketing copy",
    description: "The pitch your crew + customers see when they sign in.",
    fields: [
      { k: "login_headline_a", label: "Headline line 1", hint: 'e.g. "Stop guessing."' },
      { k: "login_headline_b", label: "Headline line 2", hint: 'e.g. "Start bracing right." (rendered in orange)' },
      { k: "login_subhead", label: "Subhead paragraph", textarea: true },
      { k: "login_stat1_value", label: "Stat 1 value", hint: 'e.g. "30m"' },
      { k: "login_stat1_label", label: "Stat 1 label" },
      { k: "login_stat2_value", label: "Stat 2 value", hint: 'e.g. "2.0×"' },
      { k: "login_stat2_label", label: "Stat 2 label" },
      { k: "login_stat3_value", label: "Stat 3 value", hint: 'e.g. "100%"' },
      { k: "login_stat3_label", label: "Stat 3 label" },
    ],
  },
  {
    key: "dashboard",
    title: "Dashboard hero",
    description: "Headline + subhead at the top of /dashboard.",
    fields: [
      { k: "dashboard_eyebrow", label: "Eyebrow (small caps)", hint: 'e.g. "Operations · Today"' },
      { k: "dashboard_title", label: "Title", hint: 'e.g. "Control Room"' },
      { k: "dashboard_subtitle", label: "Subtitle", textarea: true },
    ],
  },
  {
    key: "pages",
    title: "Page subtitles",
    description: "One-line descriptions under each page title.",
    fields: [
      { k: "bracing_subtitle", label: "Bracing Engine subtitle", textarea: true },
      { k: "estimator_subtitle", label: "Quick Estimator subtitle", textarea: true },
    ],
  },
  {
    key: "defaults",
    title: "Operational defaults",
    description: "Pre-filled values on the calculators. Crew can still override per calc.",
    fields: [
      { k: "default_safety_factor", label: "Default safety factor", hint: "Bracing engine · between 1.5 and 3.0" },
      { k: "default_rebar_size", label: "Default rebar size", hint: 'One of #3, #4, #5, #6' },
    ],
  },
];

export default function Admin() {
  const { user } = useAuth();
  const { content, refresh } = useContent();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setForm({ ...content });
    setDirty(false);
  }, [content]);

  if (user && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  }

  async function save() {
    // diff only changed keys
    const updates = {};
    Object.keys(form).forEach((k) => {
      if (String(form[k] ?? "") !== String(content[k] ?? "")) {
        updates[k] = form[k];
      }
    });
    if (Object.keys(updates).length === 0) {
      toast.info("Nothing changed");
      return;
    }
    setSaving(true);
    try {
      await api.put("/content", { updates });
      await refresh();
      toast.success(`Saved ${Object.keys(updates).length} change${Object.keys(updates).length > 1 ? "s" : ""}`);
      setDirty(false);
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function resetSection() {
    setForm({ ...content });
    setDirty(false);
    toast.info("Reverted unsaved changes");
  }

  return (
    <div className="p-6 sm:p-8 lg:p-10 max-w-[1100px]" data-testid="admin-page">
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="label-eyebrow flex items-center gap-2">
            <Shield size={12} weight="fill" className="text-orange-600" />
            Super Admin
          </div>
          <h1 className="font-display font-black text-4xl sm:text-5xl tracking-tight text-zinc-900 mt-2">
            Site content
          </h1>
          <p className="text-zinc-500 mt-1 text-sm max-w-2xl">
            Tweak headlines, brand tags, and operational defaults without touching code. Changes go live the moment you save.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={resetSection}
            disabled={!dirty}
            data-testid="admin-reset"
            className="rounded-sm font-display uppercase tracking-wider gap-2"
          >
            <ArrowCounterClockwise size={14} weight="bold" /> Revert
          </Button>
          <Button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            data-testid="admin-save"
            className="bg-orange-600 hover:bg-orange-700 text-white rounded-sm font-display uppercase tracking-wider gap-2"
          >
            <FloppyDisk size={14} weight="bold" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {dirty && (
        <div className="mb-4 border-l-4 border-orange-500 bg-orange-50 px-3 py-2 text-sm text-orange-900" data-testid="admin-dirty-banner">
          You have unsaved changes. Hit <span className="font-display font-bold">Save</span> to push them live.
        </div>
      )}

      <div className="space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.key} className="border border-zinc-200 bg-white" data-testid={`admin-section-${section.key}`}>
            <div className="border-b border-zinc-100 p-4 bg-zinc-50/60">
              <div className="font-display font-bold text-lg text-zinc-900">{section.title}</div>
              <div className="text-xs text-zinc-500 mt-0.5">{section.description}</div>
            </div>
            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              {section.fields.map((f) => (
                <div key={f.k} className={f.textarea ? "md:col-span-2" : ""}>
                  <Label className="label-eyebrow" htmlFor={f.k}>{f.label}</Label>
                  {f.textarea ? (
                    <Textarea
                      id={f.k}
                      value={form[f.k] ?? ""}
                      onChange={(e) => update(f.k, e.target.value)}
                      rows={2}
                      className="rounded-sm mt-1 font-display"
                      data-testid={`field-${f.k}`}
                    />
                  ) : (
                    <Input
                      id={f.k}
                      value={form[f.k] ?? ""}
                      onChange={(e) => update(f.k, e.target.value)}
                      className="rounded-sm mt-1"
                      data-testid={`field-${f.k}`}
                    />
                  )}
                  {f.hint && <div className="text-[11px] text-zinc-500 mt-1">{f.hint}</div>}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-xs text-zinc-400 border-t border-zinc-100 pt-4">
        Want more bits made editable here (alerts, footer terms, email templates, etc.)?
        Just ask in chat and we'll add the fields.
      </div>
    </div>
  );
}
