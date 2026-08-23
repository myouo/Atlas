"use client";

import { ArrowClockwise, WarningCircle } from "@phosphor-icons/react";

export default function GlobalError({
  reset
}: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="nivalis-page flex min-h-screen items-center justify-center p-6">
      <section className="glass-surface-strong max-w-md rounded-[24px] p-8 text-center">
        <WarningCircle aria-hidden className="mx-auto text-rose-500" size={42} weight="duotone" />
        <h1 className="mt-4 text-xl font-extrabold text-ink">页面遇到一个问题</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          没有任何 Provider 凭据或内部错误详情会显示在这里。
        </p>
        <button
          className="mx-auto mt-5 flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white"
          onClick={reset}
          type="button"
        >
          <ArrowClockwise aria-hidden size={16} weight="bold" />
          重试
        </button>
      </section>
    </main>
  );
}
