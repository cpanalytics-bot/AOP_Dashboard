"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, Field, TextInput } from "@/components/ui";
import { supabaseConfigured } from "@/lib/supabase/client";

const DEMO_EMAILS = [
  { email: "admin@org.com", role: "ADMIN" },
  { email: "anita.rao@org.com", role: "ZDM" },
  { email: "rohit.mehra@org.com", role: "BDM" },
  { email: "karan.singh@org.com", role: "BDA" },
];

export default function LoginPage() {
  const { login, currentUser } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("anita.rao@org.com");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "ADMIN") router.replace("/admin");
    else if (currentUser.role === "ZDM") router.replace("/");
    else router.replace("/view");
  }, [currentUser, router]);

  const handleLogin = () => {
    setError("");
    const ok = login(email);
    if (!ok) {
      setError("Email not found. Use a registered email from the list below.");
      return;
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl bg-indigo-600 text-lg font-bold text-white">
          A
        </div>
        <h1 className="t-display">AOP Platform</h1>
        <p className="t-body mt-1">Annual Operating Plan · FY26-27</p>
        <div className="mt-4">
          {supabaseConfigured ? (
            <Badge tone="green">Connected to Supabase</Badge>
          ) : (
            <Badge tone="amber">Demo mode · local data</Badge>
          )}
        </div>
      </div>

      <Card>
        <h2 className="t-card-heading">Sign in with email</h2>
        <p className="t-caption mt-1">Enter your registered email. Your role is detected automatically.</p>
        <div className="mt-4 space-y-3">
          <Field label="Email" error={error}>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@org.com"
              onKeyDown={(e) => e.key === "Enter" && handleLogin()}
            />
          </Field>
          <Button className="w-full" onClick={handleLogin}>
            Sign in
          </Button>
        </div>

        <div className="mt-5 border-t border-gray-100 pt-4">
          <p className="t-overline mb-2">Demo accounts</p>
          <div className="space-y-1.5">
            {DEMO_EMAILS.map((d) => (
              <button
                key={d.email}
                type="button"
                onClick={() => setEmail(d.email)}
                className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-[13px] hover:bg-gray-50"
              >
                <span className="text-gray-700">{d.email}</span>
                <Badge tone="slate">{d.role}</Badge>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
