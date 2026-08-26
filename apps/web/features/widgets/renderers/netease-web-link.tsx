import { ArrowUpRight } from "@phosphor-icons/react";
import clsx from "clsx";
import type { ReactNode } from "react";

interface NeteaseWebLinkProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly href: string | null | undefined;
  readonly indicator?: boolean;
  readonly label: string;
}

export function NeteaseWebLink({
  children,
  className,
  href,
  indicator = false,
  label
}: NeteaseWebLinkProps) {
  const safeHref = safeNeteaseWebUrl(href);
  if (!safeHref) return <div className={className}>{children}</div>;
  return (
    <a
      aria-label={label}
      className={clsx("netease-web-link relative min-w-0 no-underline", className)}
      href={safeHref}
      rel="noreferrer"
      target="_blank"
    >
      {children}
      {indicator ? (
        <ArrowUpRight
          aria-hidden
          className="netease-web-link-indicator pointer-events-none absolute top-2 right-2 text-[#e83d5b]/60"
          size={11}
          weight="bold"
        />
      ) : null}
    </a>
  );
}

export function safeNeteaseWebUrl(value: unknown) {
  if (typeof value !== "string" || value.length === 0) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      (url.hostname === "music.163.com" || url.hostname.endsWith(".music.163.com"))
    ) {
      return url.toString();
    }
    return null;
  } catch {
    return null;
  }
}
