"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Field, Spinner, TextInput } from "@/components/ui";

export default function LoginPage() {
  const { login, currentUser, liveMode } = useStore();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "ADMIN") router.replace("/admin");
    else if (currentUser.role === "ZDM") router.replace("/");
    else router.replace("/view");
  }, [currentUser, router]);

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()), [email]);

  const handleLogin = async () => {
    if (pending) return;
    setError("");
    if (!emailValid) { setError("Enter a valid work email."); return; }
    setPending(true);
    const ok = await login(email);
    if (ok) return;
    setPending(false);
    setError(
      liveMode
        ? "This email isn't authorized for the AOP platform. Contact the Admin Team for access."
        : "Email not found. Use a registered email from the list.",
    );
  };

  return (
    <div className="flex min-h-screen w-full">
      {pending && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm">
          <Spinner className="text-indigo-600" />
          <p className="mt-3 text-[13px] font-medium text-gray-600">Signing you in…</p>
        </div>
      )}

      {/* Left brand panel */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 p-12 text-white lg:flex">
        {/* decorative glows + grid */}
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60"
          style={{ background: "radial-gradient(600px 300px at 15% 0%, rgba(255,255,255,0.16), transparent 60%), radial-gradient(700px 360px at 100% 100%, rgba(14,165,233,0.25), transparent 55%)" }} />
        <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{ backgroundImage: "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

        <div className="relative flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/15 text-base font-bold ring-1 ring-inset ring-white/25">A</span>
          <span className="text-[15px] font-semibold tracking-tight">AOP Platform</span>
        </div>

        <div className="relative max-w-md">
          <h1 className="text-[34px] font-semibold leading-[1.15] tracking-tight">
            Plan the year.<br />Power every zone.
          </h1>
          <p className="mt-4 text-[15px] leading-relaxed text-indigo-100/90">
            The Annual Operating Plan for FY 2026–27 — built for Zonal Managers to plan revenue,
            universe and collections for every team member, with live data and clean approvals.
          </p>
          <ul className="mt-7 space-y-3">
            {[
              "Zone-level operating plans, member by member",
              "Live AOV, last-year revenue & school universe",
              "Per-member approvals for the Admin Team",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2.5 text-[14px] text-indigo-50">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15 text-[11px] ring-1 ring-inset ring-white/25">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-[12px] text-indigo-200/80">Physics Wallah · K8 Field Sales · Zonal Operating Plan</div>
      </div>

      {/* Right form panel */}
      <div className="auth-bg relative flex w-full items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="page-enter w-full max-w-[380px]">
          {/* Brand (mobile only) */}
          <div className="mb-8 flex flex-col items-center lg:hidden">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-600 text-lg font-bold text-white shadow-lg shadow-indigo-600/20">A</div>
            <h1 className="t-display mt-3">AOP Platform</h1>
            <p className="t-body mt-1">Annual Operating Plan · FY 2026–27</p>
          </div>

          {/* Heading */}
          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-[26px] font-semibold leading-tight tracking-tight text-gray-900">Welcome back</h2>
            <p className="mt-1.5 text-[14px] text-gray-500">Sign in to your operating plan.</p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-7 shadow-[0_10px_40px_-12px_rgba(16,24,40,0.18)]">
            <div className="space-y-4">
              <Field label="Work email" error={error}>
                <TextInput
                  type="email"
                  autoFocus
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@pw.live"
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </Field>
              <Button className="w-full" onClick={handleLogin} disabled={pending || !email.trim()}>
                {pending ? (<><Spinner className="text-white" /> Signing in…</>) : "Sign in"}
              </Button>
            </div>

            <div className="mt-5 flex items-center justify-center gap-2 border-t border-gray-100 pt-4">
              {liveMode ? <Badge tone="green" icon="●">Secure</Badge> : <Badge tone="amber">Demo</Badge>}
              <span className="text-[11.5px] text-gray-400">Authorized Zonal Managers &amp; Admin Team only</span>
            </div>
          </div>

          <p className="mt-6 text-center text-[11px] text-gray-400">Access is granted by permission — your role is detected automatically.</p>
        </div>
      </div>
    </div>
  );
}
