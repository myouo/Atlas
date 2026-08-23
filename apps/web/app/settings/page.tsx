"use client";

import {
  ArrowLeft,
  Check,
  CloudArrowUp,
  Eye,
  ImageSquare,
  Palette,
  ShieldCheck,
  TextAa
} from "@phosphor-icons/react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

type Accent = "blue" | "lilac" | "rose";
type Glass = "balanced" | "strong" | "subtle";

export default function SettingsPage() {
  const [accent, setAccent] = useState<Accent>("blue");
  const [glass, setGlass] = useState<Glass>("balanced");
  const [rotation, setRotation] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = () => {
    localStorage.setItem(
      "nivalis.appearance.phase1.v1",
      JSON.stringify({ accent, glass, rotation })
    );
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2_000);
  };

  return (
    <main className="nivalis-page">
      <div className="nivalis-content max-w-[1120px]">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link
            className="glass-surface-strong flex h-11 items-center gap-2 rounded-full px-4 text-xs font-extrabold text-ink transition hover:bg-white"
            href="/"
          >
            <ArrowLeft aria-hidden size={16} weight="bold" />
            返回 About Me
          </Link>
          <span className="rounded-full bg-blue-500 px-4 py-2 text-xs font-extrabold text-white shadow-lg">
            Settings
          </span>
        </header>

        <div className="mt-16 sm:mt-20">
          <p className="text-xs font-extrabold tracking-[0.18em] text-blue-600 uppercase">
            Personalize your canvas
          </p>
          <h1 className="mt-2 text-4xl font-black tracking-[-0.04em] text-ink sm:text-5xl">
            外观与数据设置
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed font-medium text-ink-muted">
            背景、字体、主题、玻璃强度、Provider 和隐私设置只存在于这里，不会占据 About Me 首页。
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
          <section className="glass-surface rounded-[26px] p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <ImageSquare aria-hidden size={21} weight="duotone" />
              </span>
              <div>
                <h2 className="text-base font-extrabold text-ink">Background</h2>
                <p className="text-[11px] text-ink-muted">选择首页背景与轮换方式</p>
              </div>
            </div>
            <button
              aria-pressed="true"
              className="relative mt-5 block w-full overflow-hidden rounded-[20px] border-2 border-blue-500 bg-white/50 p-2 text-left"
              type="button"
            >
              <Image
                alt="雪蓝城市背景预览"
                className="aspect-[16/7] w-full rounded-[14px] object-cover object-top"
                height={620}
                loading="eager"
                src="/images/nivalis-background.png"
                width={1100}
              />
              <span className="absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-md">
                <Check aria-hidden size={14} weight="bold" />
              </span>
              <span className="mt-3 block px-1 pb-1 text-xs font-extrabold text-ink">
                雪蓝晨光 · 默认
              </span>
            </button>
            <label className="mt-4 flex cursor-pointer items-center justify-between rounded-2xl border border-white/80 bg-white/50 px-4 py-3">
              <span>
                <span className="block text-xs font-extrabold text-ink">Background rotation</span>
                <span className="mt-0.5 block text-[10px] text-ink-muted">
                  Phase 7 将接入对象存储中的背景集合
                </span>
              </span>
              <input
                checked={rotation}
                className="h-4 w-4 accent-blue-600"
                onChange={(event) => setRotation(event.target.checked)}
                type="checkbox"
              />
            </label>
          </section>

          <div className="space-y-5">
            <section className="glass-surface rounded-[26px] p-5">
              <div className="flex items-center gap-3">
                <Palette aria-hidden className="text-blue-600" size={22} weight="duotone" />
                <h2 className="text-base font-extrabold text-ink">Theme & Accent</h2>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["blue", "lilac", "rose"] as const).map((value) => (
                  <button
                    aria-label={`Accent ${value}`}
                    aria-pressed={accent === value}
                    className={
                      accent === value
                        ? "h-10 rounded-xl border-2 border-blue-600 bg-white/80 text-[10px] font-bold text-ink"
                        : "h-10 rounded-xl border border-white/80 bg-white/45 text-[10px] font-bold text-ink-muted"
                    }
                    key={value}
                    onClick={() => setAccent(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </section>

            <section className="glass-surface rounded-[26px] p-5">
              <div className="flex items-center gap-3">
                <TextAa aria-hidden className="text-blue-600" size={22} weight="duotone" />
                <h2 className="text-base font-extrabold text-ink">Font & Glass</h2>
              </div>
              <label className="mt-4 block text-[10px] font-bold text-ink-muted">
                字体
                <select className="mt-2 h-10 w-full rounded-xl border border-white/90 bg-white/70 px-3 text-xs font-semibold text-ink">
                  <option>Noto Sans SC</option>
                  <option>System Sans</option>
                </select>
              </label>
              <div className="mt-4 grid grid-cols-3 gap-2">
                {(["subtle", "balanced", "strong"] as const).map((value) => (
                  <button
                    aria-pressed={glass === value}
                    className={
                      glass === value
                        ? "rounded-xl bg-blue-600 px-2 py-2 text-[10px] font-bold text-white"
                        : "rounded-xl bg-white/55 px-2 py-2 text-[10px] font-bold text-ink-muted"
                    }
                    key={value}
                    onClick={() => setGlass(value)}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <section className="glass-surface rounded-[26px] p-5">
            <div className="flex items-center gap-3">
              <CloudArrowUp aria-hidden className="text-blue-600" size={22} weight="duotone" />
              <div>
                <h2 className="text-base font-extrabold text-ink">Provider & Sync</h2>
                <p className="text-[10px] text-ink-muted">真实 Connector 从 Phase 5 开始接入</p>
              </div>
            </div>
            <div className="mt-4 space-y-2">
              {["网易云音乐", "GitHub", "Bangumi", "Steam", "Bilibili"].map((provider) => (
                <div
                  className="flex items-center justify-between rounded-xl bg-white/45 px-3 py-2.5"
                  key={provider}
                >
                  <span className="text-xs font-bold text-ink">{provider}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">
                    未连接
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="glass-surface rounded-[26px] p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck aria-hidden className="text-blue-600" size={22} weight="duotone" />
              <div>
                <h2 className="text-base font-extrabold text-ink">Privacy</h2>
                <p className="text-[10px] text-ink-muted">公共 Dashboard 使用显式字段白名单</p>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-white/80 bg-white/45 p-4">
              <Eye aria-hidden className="text-blue-500" size={20} weight="duotone" />
              <p className="mt-3 text-xs font-extrabold text-ink">Published data only</p>
              <p className="mt-1 text-[10px] leading-relaxed text-ink-muted">
                Draft、凭据、Raw Snapshot 与 Provider 错误详情永远不会进入公共 Read Model。
              </p>
            </div>
          </section>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            className="flex h-11 items-center gap-2 rounded-xl bg-blue-600 px-5 text-xs font-extrabold text-white shadow-lg transition hover:bg-blue-700"
            onClick={save}
            type="button"
          >
            <Check aria-hidden size={16} weight="bold" />
            {saved ? "已保存到浏览器" : "保存设置"}
          </button>
        </div>
      </div>
    </main>
  );
}
