import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="nivalis-page flex min-h-screen items-center justify-center p-6">
      <section className="glass-surface-strong max-w-md rounded-[24px] p-8 text-center">
        <p className="text-xs font-extrabold tracking-[0.18em] text-blue-600">404</p>
        <h1 className="mt-2 text-2xl font-black tracking-[-0.03em] text-ink">这里没有 Dashboard</h1>
        <p className="mt-2 text-sm text-ink-muted">返回 About Me 查看已发布的个人数据画布。</p>
        <Link
          className="mx-auto mt-5 flex h-10 w-fit items-center gap-2 rounded-xl bg-blue-600 px-4 text-xs font-extrabold text-white"
          href="/"
        >
          <ArrowLeft aria-hidden size={16} weight="bold" />
          返回首页
        </Link>
      </section>
    </main>
  );
}
