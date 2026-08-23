import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Settings — Nivalis",
  description: "Appearance, Provider, synchronization, and privacy settings"
};

export default function SettingsLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
