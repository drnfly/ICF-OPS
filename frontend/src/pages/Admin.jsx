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
import { Shield, FloppyDisk, ArrowCounterClockwise, Upload, Trash, ImageSquare } from "@phosphor-icons/react";
import { API_BASE } from "../lib/api";

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
  const [uploading, setUploading] = useState(false);
  const [logoCacheBuster, setLogoCacheBuster] = useState(Date.now());

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

  // ─── Logo upload ────────────────────────────────────────────────────────
  async function uploadLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = "";  // reset so the same file can be reselected
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be 2 MB or less");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post("/content/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await refresh();
      setLogoCacheBuster(Date.now());
      toast.success("Logo updated");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeLogo() {
    if (!confirm("Remove the logo and fall back to text initials?")) return;
    try {
      await api.delete("/content/logo");
      await refresh();
      setLogoCacheBuster(Date.now());
      toast.success("Logo removed");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Remove failed");
    }
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

            {section.key === "brand" && (
              <div className="p-5 border-b border-zinc-100">
                <Label className="label-eyebrow mb-2 block">Logo image</Label>
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 border-2 border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center overflow-hidden">
                    {content.has_logo ? (
                      <img
                        src={`${API_BASE}/content/logo?v=${logoCacheBuster}`}
                        alt="Current logo"
                        className="max-w-full max-h-full object-contain"
                        data-testid="logo-preview"
                      />
                    ) : (
                      <ImageSquare size={28} weight="duotone" className="text-zinc-400" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex gap-2 flex-wrap">
                      <label
                        className={`inline-flex items-center gap-2 px-3 py-2 border border-zinc-300 hover:bg-zinc-50 rounded-sm cursor-pointer font-display text-xs uppercase tracking-wider ${uploading ? "opacity-50 pointer-events-none" : ""}`}
                        data-testid="logo-upload-label"
                      >
                        <Upload size={12} weight="bold" />
                        {uploading ? "Uploading…" : content.has_logo ? "Replace" : "Upload logo"}
                        <input
                          type="file"
                          accept=".png,.jpg,.jpeg,.webp,.svg,image/*"
                          onChange={uploadLogo}
                          className="hidden"
                          data-testid="logo-upload-input"
                        />
                      </label>
                      {content.has_logo && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={removeLogo}
                          data-testid="logo-remove-btn"
                          className="rounded-sm font-display uppercase tracking-wider text-xs gap-1.5 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
                        >
                          <Trash size={12} weight="bold" /> Remove
                        </Button>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-1.5">
                      PNG / JPG / WebP / SVG · max 2 MB · falls back to brand-name initials if no logo set.
                    </div>
                  </div>
                </div>
              </div>
            )}

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
