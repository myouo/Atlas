"use client";

import type { SteamDataCatalog } from "@nivalis/api-client";
import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useMemo, useState } from "react";
import { dashboardSource } from "../../api/dashboard-source-factory";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function records(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}
function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
    ? value.toLocaleString("zh-CN")
    : "未知";
}
function hours(value: unknown) {
  return typeof value === "number"
    ? `${(value / 60).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 小时`
    : "未公开";
}
function date(value: unknown) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString("zh-CN")
    : "未返回";
}

export function SteamDataExplorer({ enabled }: { readonly enabled: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const query = useQuery({
    queryKey: ["provider-data", "steam", dashboardSource.kind],
    queryFn: () => dashboardSource.getSteamDataCatalog(),
    enabled: enabled && expanded && dashboardSource.kind === "api",
    retry: false,
    staleTime: 30_000
  });
  return (
    <div className="mt-5 border-t border-white/60 pt-4">
      <button
        type="button"
        className="jelly-control rounded-xl bg-white/70 px-4 py-2 text-xs font-bold text-ink"
        disabled={!enabled && !expanded}
        aria-expanded={expanded}
        aria-controls="steam-owner-catalog"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "收起 Steam 数据目录" : "查看完整 Steam 数据"}
      </button>
      {expanded ? (
        <div id="steam-owner-catalog" className="mt-4">
          {query.isPending ? (
            <p role="status" className="text-xs text-ink-muted">
              正在读取完整数据目录…
            </p>
          ) : query.data ? (
            <SteamCatalogView key={query.data.dataVersion} value={query.data} />
          ) : (
            <div role="alert" className="text-xs text-ink-muted">
              <p>尚无可读取的 Steam 数据目录，请先完成同步。</p>
              <button type="button" className="mt-2 underline" onClick={() => void query.refetch()}>
                重新读取目录
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

const sectionNames = {
  library: "游戏库",
  recentGames: "最近两周",
  badges: "徽章",
  achievements: "逐游戏成就",
  inventory: "库存",
  wishlist: "愿望单"
};
const statusNames: Record<string, string> = {
  complete: "接口返回完整",
  partial: "部分覆盖",
  unavailable: "不可用",
  not_collected: "未采集"
};

export function SteamCatalogView({ value }: { readonly value: SteamDataCatalog }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [collection, setCollection] = useState<"library" | "recentGames">("library");
  const term = useDeferredValue(search.trim().toLocaleLowerCase());
  const data = value.catalog;
  const library = record(data.library);
  const badges = record(data.badges);
  const account = record(data.accountDetails);
  const coverage = record(data.coverage);
  const playtime = record(library.playtimeCoverage);
  const achievements = record(data.achievements);
  const achievementGames = records(achievements.games);
  const games = useMemo(
    () => records(record(data[collection])[collection === "library" ? "games" : "items"]),
    [data, collection]
  );
  const filtered = useMemo(
    () =>
      games.filter(
        (game) =>
          !term ||
          String(game.name).toLocaleLowerCase().includes(term) ||
          String(game.appId).includes(term)
      ),
    [games, term]
  );
  const lastPage = Math.max(0, Math.ceil(filtered.length / 30) - 1);
  const currentPage = Math.min(page, lastPage);
  const exportData = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `steam-catalog-${value.dataVersion}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <section aria-label="Steam 完整数据目录" className="text-xs text-ink">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-extrabold">Steam 完整数据目录</h3>
          <p className="mt-1 text-ink-muted">
            仅 Owner 可见 · 更新于 {date(value.generatedAt)} · 数据版本 {value.schemaVersion}
          </p>
        </div>
        <button
          type="button"
          className="jelly-control rounded-xl bg-white/70 px-4 py-2 font-bold"
          onClick={exportData}
        >
          导出完整 JSON
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["游戏数量", count(library.gameCount)],
          ["未游玩", count(library.unplayedGameCount)],
          [
            "徽章数量",
            badges.availability === "available" ? count(records(badges.items).length) : "不可用"
          ],
          ["经验值", count(badges.playerXp)]
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl bg-white/45 p-3">
            <p className="text-ink-muted">{label}</p>
            <p className="mt-1 text-base font-extrabold tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 leading-relaxed text-ink-muted">
        注册时间：{date(account.createdAt)} · 最近离线：{date(account.lastLogoffAt)} ·
        下一级所需经验：{count(badges.xpNeededToLevelUp)}
      </p>
      {library.availability === "available" ? (
        <p className="mt-2 leading-relaxed text-ink-muted">
          累计游玩 {hours(library.playtimeMinutes)}；已知时长 {hours(playtime.knownMinutes)}，
          {count(playtime.unknownGameCount)} 款游戏的时长未知。平台时长不会重复计入总时长。
        </p>
      ) : null}
      <dl className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Steam 数据覆盖范围">
        {Object.entries(sectionNames).map(([key, label]) => {
          const item = record(coverage[key]);
          return (
            <div
              key={key}
              className="flex items-center justify-between gap-3 rounded-xl bg-white/40 px-3 py-2"
            >
              <dt>{label}</dt>
              <dd className="text-right text-ink-muted">
                {typeof item.status === "string"
                  ? (statusNames[item.status] ?? "未知")
                  : "旧快照，请重新同步"}
                {typeof item.reportedCount === "number"
                  ? ` · ${count(item.collectedCount)}/${count(item.reportedCount)}`
                  : ""}
              </dd>
            </div>
          );
        })}
      </dl>
      <p className="mt-3 leading-relaxed text-ink-muted">
        “接口返回完整”指已保留本次接口返回的全部记录，不代表能读取 Steam
        隐藏数据、所有授权或整个账号历史。成就优先覆盖最近及高时长的{" "}
        {count(achievements.requestBudget)} 款游戏，不是全库总数。库存和愿望单未采集。
      </p>
      {achievementGames.length ? (
        <details className="mt-4 rounded-xl bg-white/40 p-3">
          <summary className="cursor-pointer font-bold">
            逐游戏成就 · {achievementGames.length} 款
          </summary>
          <ul className="mt-3 space-y-2">
            {achievementGames.map((game) => (
              <li key={String(game.appId)} className="flex flex-wrap justify-between gap-2">
                <span>App {String(game.appId)}</span>
                <span>
                  {game.availability === "available"
                    ? `${count(game.unlockedCount)} / ${count(game.totalCount)} 已解锁`
                    : "不可用（不记作零成就）"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <select
          aria-label="Steam 数据集合"
          className="settings-select h-10 rounded-xl px-3"
          value={collection}
          onChange={(event) => {
            setCollection(event.target.value === "recentGames" ? "recentGames" : "library");
            setPage(0);
          }}
        >
          <option value="library">完整游戏库</option>
          <option value="recentGames">全部最近游戏</option>
        </select>
        <input
          aria-label="搜索 Steam 游戏"
          placeholder="搜索游戏名或 App ID"
          className="settings-select h-10 min-w-0 flex-1 rounded-xl px-3"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
      </div>
      <ul className="mt-3 space-y-2" aria-label="Steam 游戏明细">
        {filtered.slice(currentPage * 30, (currentPage + 1) * 30).map((game) => {
          const platforms = record(game.platformPlaytimeMinutes);
          return (
            <li key={String(game.appId)} className="rounded-xl bg-white/45 p-3">
              <p className="font-bold">
                {String(game.name ?? "未知游戏")}{" "}
                <span className="font-normal text-ink-muted">· {String(game.appId)}</span>
              </p>
              <p className="mt-1 text-ink-muted">
                累计 {hours(game.playtimeMinutes)} · 最近两周 {hours(game.recentPlaytimeMinutes)} ·
                最后游玩 {date(game.lastPlayedAt)}
              </p>
              <p className="mt-1 leading-relaxed text-ink-muted">
                Windows {hours(platforms.windows)} / macOS {hours(platforms.mac)} / Linux{" "}
                {hours(platforms.linux)} / Steam Deck {hours(platforms.steamDeck)}
              </p>
            </li>
          );
        })}
      </ul>
      {!filtered.length ? (
        <p className="mt-3 text-ink-muted">
          {games.length
            ? "没有匹配的游戏"
            : record(data[collection]).availability === "available"
              ? "该集合为空"
              : "该集合不可用，请查看覆盖状态"}
        </p>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-ink-muted">
          {filtered.length} 条 · 第 {currentPage + 1}/{lastPage + 1} 页
        </span>
        <div className="flex gap-2">
          {[
            ["上一页", -1],
            ["下一页", 1]
          ].map(([label, step]) => (
            <button
              key={label}
              type="button"
              className="jelly-control rounded-lg bg-white/70 px-3 py-2 disabled:opacity-40"
              disabled={step === -1 ? currentPage === 0 : currentPage >= lastPage}
              onClick={() => setPage(currentPage + Number(step))}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
