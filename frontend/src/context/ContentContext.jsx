import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, API_BASE } from "../lib/api";

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

  // Sync browser tab: title from brand_name, favicon from uploaded logo
  useEffect(() => {
    if (content.brand_name) {
      document.title = content.brand_name;
    }

    const ensureFaviconLink = () => {
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      return link;
    };

    const link = ensureFaviconLink();
    if (content.has_logo) {
      // cache-bust on logo updates by tying to the brand_name version
      link.href = `${API_BASE}/content/logo?v=${encodeURIComponent(content.brand_name || "")}`;
      link.type = "";  // let the response Content-Type drive it
      link.dataset.icfRestored = "0";
    } else if (link.dataset.icfRestored !== "1") {
      // Restore the default React favicon
      link.href = "/favicon.ico";
      link.type = "image/x-icon";
      link.dataset.icfRestored = "1";
    }
  }, [content.has_logo, content.brand_name]);

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
