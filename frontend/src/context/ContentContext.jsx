import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";

const ContentCtx = createContext(null);

// Defaults match backend DEFAULT_CONTENT so the UI is never blank during the initial fetch.
const FALLBACK = {
  brand_name: "ICF OPS HUB",
  brand_tagline: "Operations Console",
  login_headline_a: "Stop guessing.",
  login_headline_b: "Start bracing right.",
  login_subhead:
    "ACI 347 lateral-pressure calcs, live rental tracking, and BOM estimates in one rugged console — built for the trailer and the truck.",
  login_stat1_value: "30m",
  login_stat1_label: "Saved per wall layout",
  login_stat2_value: "2.0×",
  login_stat2_label: "Default safety factor",
  login_stat3_value: "100%",
  login_stat3_label: "Field-ready, mobile-first",
  dashboard_eyebrow: "Operations · Today",
  dashboard_title: "Control Room",
  dashboard_subtitle: "Real-time view of your bracing math, rentals, and crew activity.",
  bracing_subtitle:
    "Enter wall specs and pour parameters. Get brace spacing, count, hardware, and safety factor — backed by ACI 347 lateral concrete pressure formulas.",
  estimator_subtitle: "Wall area → ICF blocks, concrete yardage, rebar tonnage, and a printable BOM.",
  default_safety_factor: "2.0",
  default_rebar_size: "#4",
};

export function ContentProvider({ children }) {
  const [content, setContent] = useState(FALLBACK);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/content");
      setContent({ ...FALLBACK, ...data });
    } catch {
      // keep fallback
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ContentCtx.Provider value={{ content, refresh, setContent }}>
      {children}
    </ContentCtx.Provider>
  );
}

export function useContent() {
  return useContext(ContentCtx) || { content: FALLBACK, refresh: () => {}, setContent: () => {} };
}

export function t(content, key) {
  return content[key] ?? FALLBACK[key] ?? "";
}
