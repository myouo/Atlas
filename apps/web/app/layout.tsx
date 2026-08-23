import "@fontsource-variable/noto-sans-sc";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Nivalis — About Me",
  description: "Personal digital identity and composable data dashboard",
  icons: {
    icon: "/images/profile-avatar.png"
  }
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
