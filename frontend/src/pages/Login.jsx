import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useContent } from "../context/ContentContext";
import { API_BASE } from "../lib/api";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Label } from "../components/ui/label";
import { ArrowRight, Hammer } from "@phosphor-icons/react";

export default function Login() {
  const { user, login, register, error } = useAuth();
  const { content } = useContent();
  const nav = useNavigate();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("admin@icfhub.com");
  const [password, setPassword] = useState("admin123");
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (user) nav("/", { replace: true });
  }, [user, nav]);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    const ok =
      mode === "login"
        ? await login(email, password)
        : await register({ email, password, name, role: "foreman" });
    setSubmitting(false);
    if (ok) nav("/", { replace: true });
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-col justify-between p-12 relative bg-zinc-950 text-white overflow-hidden">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "url('https://images.pexels.com/photos/7108784/pexels-photo-7108784.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=900')",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950/85 to-orange-950/70" />
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-orange-500 flex items-center justify-center brand-shadow overflow-hidden">
              {content.has_logo ? (
                <img src={`${API_BASE}/content/logo`} alt={content.brand_name} className="max-w-full max-h-full object-contain" />
              ) : (
                <Hammer size={24} weight="fill" color="#09090B" />
              )}
            </div>
            <div>
              <div className="font-display font-black text-2xl tracking-tight">{content.brand_name}</div>
              <div className="text-[11px] tracking-[0.3em] uppercase text-orange-400">{content.brand_tagline}</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 max-w-md">
          <div className="diag-stripes h-1.5 w-24 mb-8" />
          <h1 className="font-display font-black text-5xl leading-[0.95] tracking-tight">
            {content.login_headline_a}<br />
            <span className="text-orange-500">{content.login_headline_b}</span>
          </h1>
          <p className="mt-6 text-zinc-300 text-base leading-relaxed">
            {content.login_subhead}
          </p>
          <div className="mt-10 grid grid-cols-3 gap-6 text-xs tracking-widest uppercase font-display font-medium">
            <div>
              <div className="text-orange-400 text-3xl font-black font-display">{content.login_stat1_value}</div>
              <div className="text-zinc-400 mt-1">{content.login_stat1_label}</div>
            </div>
            <div>
              <div className="text-orange-400 text-3xl font-black font-display">{content.login_stat2_value}</div>
              <div className="text-zinc-400 mt-1">{content.login_stat2_label}</div>
            </div>
            <div>
              <div className="text-orange-400 text-3xl font-black font-display">{content.login_stat3_value}</div>
              <div className="text-zinc-400 mt-1">{content.login_stat3_label}</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 text-[10px] tracking-[0.3em] uppercase text-zinc-500">
          Formulas based on ACI 347 · ASCE 7 Exposure Categories · Manufacturer brace ratings
        </div>
      </div>

      {/* RIGHT FORM */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-zinc-900 flex items-center justify-center brand-shadow overflow-hidden">
              {content.has_logo ? (
                <img src={`${API_BASE}/content/logo`} alt={content.brand_name} className="max-w-full max-h-full object-contain" />
              ) : (
                <span className="font-display font-black text-orange-500 text-lg">{(content.brand_name || "IC").slice(0, 2).toUpperCase()}</span>
              )}
            </div>
            <div>
              <div className="font-display font-bold text-zinc-900">{content.brand_name}</div>
              <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-500">{content.brand_tagline}</div>
            </div>
          </div>

          <div className="label-eyebrow mb-3">{mode === "login" ? "Sign in" : "Create account"}</div>
          <h2 className="font-display font-black text-4xl tracking-tight text-zinc-900">
            {mode === "login" ? "Welcome back." : "Set up your hub."}
          </h2>
          <p className="text-zinc-500 mt-2 text-sm">
            {mode === "login" ? "Punch in. Run the math. Send it." : "Provision your account — you'll be ready in 30 seconds."}
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5" data-testid="auth-form">
            {mode === "register" && (
              <div>
                <Label className="label-eyebrow" htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  data-testid="register-name-input"
                  className="mt-2 rounded-sm border-zinc-300 focus:border-orange-600 focus:ring-orange-600 h-11"
                  placeholder="Mike Foreman"
                />
              </div>
            )}
            <div>
              <Label className="label-eyebrow" htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                data-testid="email-input"
                className="mt-2 rounded-sm border-zinc-300 focus:border-orange-600 focus:ring-orange-600 h-11"
              />
            </div>
            <div>
              <Label className="label-eyebrow" htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                data-testid="password-input"
                className="mt-2 rounded-sm border-zinc-300 focus:border-orange-600 focus:ring-orange-600 h-11"
              />
            </div>

            {error && (
              <div className="bg-red-50 border-l-4 border-red-600 px-3 py-2 text-sm text-red-700" data-testid="auth-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              data-testid="auth-submit-btn"
              className="w-full h-12 bg-orange-600 hover:bg-orange-700 text-white font-display font-semibold tracking-wider uppercase text-sm rounded-sm transition-colors group"
            >
              {submitting ? "Working…" : mode === "login" ? "Sign In" : "Create Account"}
              <ArrowRight size={18} className="ml-2 group-hover:translate-x-1 transition-transform" weight="bold" />
            </Button>
          </form>

          <div className="mt-6 text-sm text-zinc-500">
            {mode === "login" ? (
              <>
                New to ICF Ops Hub?{" "}
                <button
                  onClick={() => setMode("register")}
                  className="text-orange-600 font-semibold hover:underline"
                  data-testid="switch-to-register"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  onClick={() => setMode("login")}
                  className="text-orange-600 font-semibold hover:underline"
                  data-testid="switch-to-login"
                >
                  Sign in
                </button>
              </>
            )}
          </div>

          <div className="mt-12 border-t border-zinc-200 pt-6 text-xs text-zinc-500 leading-relaxed">
            <div className="label-eyebrow mb-2 text-zinc-400">Demo credentials</div>
            <div className="font-mono">admin@icfhub.com / admin123</div>
            <div className="font-mono">foreman@icfhub.com / foreman123</div>
          </div>
        </div>
      </div>
    </div>
  );
}
