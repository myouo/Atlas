import type { Metadata } from "next";
import type { ReactNode } from "react";
import { defaultCardStyle } from "../design-system/appearance";

import "./globals.css";

export const metadata: Metadata = {
  title: "Nivalis — About Me",
  description: "Personal digital identity and composable data dashboard",
  icons: {
    icon: "/images/mock-avatar-profile.webp"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html data-card-style={defaultCardStyle} lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
