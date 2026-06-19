"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { Badge, Button, Card, Field, TextInput } from "@/components/ui";
import { supabaseConfigured } from "@/lib/supabase/client";

export default function LoginPage() {
  const { login, currentUser } = useStore();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!currentUser) return;
    if (currentUser.role === "ADMIN") router.replace("/admin");
    else if (currentUser.role === "ZDM") router.replace("/");
    else router.replace("/view");
  }, [currentUser, router]);

  const handleLogin = async () => {
    setError("");
    const ok = await login(email);
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
      </Card>
    </div>
  );
}
