"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

import { applyAppearanceSettings, readAppearanceSettings } from "../design-system/appearance";

export function AppProviders({ children }: Readonly<{ children: ReactNode }>) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 60_000
          }
        }
      })
  );

  useEffect(() => {
    const settings = readAppearanceSettings();
    if (settings) applyAppearanceSettings(settings);
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
