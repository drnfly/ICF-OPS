import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  ChartBar,
  Wrench,
  Calculator,
  Package,
  Receipt,
  CalendarPlus,
  MagnifyingGlass,
  Wrench as WrenchIcon,
  CalendarBlank,
  SignOut,
  List as ListIcon,
  Shield,
  X,
} from "@phosphor-icons/react";
import { useContent } from "../context/ContentContext";

const navItems = [
  { to: "/", label: "Dashboard", icon: ChartBar, end: true, testid: "nav-dashboard" },
  { to: "/bracing", label: "Bracing Engine", icon: Wrench, testid: "nav-bracing" },
  { to: "/estimator", label: "Quick Estimator", icon: Calculator, testid: "nav-estimator" },
  { to: "/equipment", label: "Equipment", icon: Package, testid: "nav-equipment" },
  { to: "/rentals", label: "Rentals", icon: Receipt, testid: "nav-rentals" },
  { to: "/bookings", label: "Bookings", icon: CalendarPlus, testid: "nav-bookings" },
  { to: "/capacity", label: "Capacity", icon: MagnifyingGlass, testid: "nav-capacity" },
  { to: "/calendar", label: "Calendar", icon: CalendarBlank, testid: "nav-calendar" },
  { to: "/maintenance", label: "Maintenance", icon: WrenchIcon, testid: "nav-maintenance" },
];

const adminNav = { to: "/admin", label: "Site Admin", icon: Shield, testid: "nav-admin" };

export default function Layout() {
  const { user, logout } = useAuth();
  const { content } = useContent();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await logout();
    nav("/login");
  }

  const items = user?.role === "admin" ? [...navItems, adminNav] : navItems;

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* TOP BAR */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
        <div className="flex items-center justify-between px-4 sm:px-6 h-16">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden p-2 -ml-2"
              onClick={() => setOpen(!open)}
              data-testid="mobile-menu-toggle"
              aria-label="Toggle menu"
            >
              {open ? <X size={22} /> : <ListIcon size={22} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 bg-zinc-900 flex items-center justify-center brand-shadow">
                <span className="font-display font-black text-orange-500 text-lg leading-none">{(content.brand_name || "IC").slice(0, 2).toUpperCase()}</span>
              </div>
              <div className="leading-tight">
                <div className="font-display font-bold tracking-tight text-zinc-900">{content.brand_name}</div>
                <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-500">{content.brand_tagline}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <div className="text-sm font-medium text-zinc-900" data-testid="header-user-name">{user?.name}</div>
              <div className="text-[10px] tracking-[0.2em] uppercase text-zinc-500" data-testid="header-user-role">{user?.role}</div>
            </div>
            <div className="w-9 h-9 bg-orange-600 text-white flex items-center justify-center font-display font-bold text-sm">
              {user?.name?.[0]?.toUpperCase() || "?"}
            </div>
            <button
              onClick={handleLogout}
              className="p-2 hover:bg-zinc-100 transition-colors"
              data-testid="logout-btn"
              aria-label="Logout"
            >
              <SignOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 relative">
        {/* SIDEBAR */}
        <aside
          className={`fixed lg:sticky inset-y-0 top-16 left-0 z-20 w-64 border-r border-zinc-200 bg-white transform transition-transform lg:translate-x-0 ${
            open ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 h-[calc(100vh-4rem)] flex flex-col`}
        >
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                data-testid={item.testid}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm transition-colors group ${
                    isActive
                      ? "bg-zinc-900 text-white"
                      : "text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900"
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <item.icon
                      size={18}
                      weight={isActive ? "fill" : "regular"}
                      className={isActive ? "text-orange-500" : ""}
                    />
                    <span className="font-display font-medium tracking-wide uppercase text-xs">
                      {item.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="p-4 border-t border-zinc-200">
            <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-400">v 1.0 · ICF OPS</div>
            <div className="text-[10px] text-zinc-400 mt-1">ACI 347 · ASCE 7</div>
          </div>
        </aside>

        {/* OVERLAY mobile */}
        {open && (
          <div
            onClick={() => setOpen(false)}
            className="fixed inset-0 bg-black/40 z-10 lg:hidden"
          />
        )}

        {/* MAIN */}
        <main className="flex-1 min-w-0 overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
