"use client";

import { StoreProvider } from "@/lib/store";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return <StoreProvider>{children}</StoreProvider>;
}
