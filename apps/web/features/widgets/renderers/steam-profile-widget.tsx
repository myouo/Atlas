import { ArrowUpRight, GameController } from "@phosphor-icons/react";
import type { WidgetOf } from "../widget-types";
import { SteamProfileWidget as LegacySteamProfileWidget } from "./platform-profile-widgets";

const reasons: Record<string, string> = {
  not_synced: "尚未同步 Steam 数据",
  not_shared: "未选择公开这项数据",
  private: "Steam 隐私设置未公开这项数据",
  not_returned: "Steam 未返回数据，请检查游戏详情和时长的可见性"
};
function hours(minutes: number | null) {
  return minutes === null
    ? "未公开"
    : `${(minutes / 60).toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 小时`;
}

export function SteamProfileWidget({ widget }: Readonly<{ widget: WidgetOf<"steam.profile"> }>) {
  if (widget.schemaVersion === 1) return <LegacySteamProfileWidget widget={widget} />;
  const { account, library, recentGames } = widget.data;
  return (
    <div className="flex min-h-full flex-col gap-4">
      {account.availability === "available" ? (
        <a
          href={account.profileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="jelly-control flex min-w-0 items-center gap-3 rounded-xl p-1 text-ink"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-100/70 text-blue-700">
            <GameController aria-hidden size={26} weight="duotone" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-base font-extrabold">{account.displayName}</span>
            <span className="mt-1 block text-[11px] text-ink-muted">
              {account.level === null ? "Steam Community" : `Steam 等级 ${account.level}`}
            </span>
          </span>
          <ArrowUpRight aria-hidden size={16} />
        </a>
      ) : (
        <p className="text-xs leading-relaxed text-ink-muted">{reasons[account.reason]}</p>
      )}
      {library.availability === "available" ? (
        <dl className="grid grid-cols-2 gap-3 rounded-2xl bg-white/40 p-3">
          <div>
            <dt className="text-[11px] text-ink-muted">游戏库</dt>
            <dd className="mt-1 text-xl font-extrabold tabular-nums text-ink">
              {library.gameCount.toLocaleString("zh-CN")}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-ink-muted">累计游玩</dt>
            <dd className="mt-1 text-base font-extrabold tabular-nums text-ink">
              {hours(library.playtimeMinutes)}
            </dd>
          </div>
          {library.playedGameCount !== null ? (
            <div className="col-span-2 flex flex-wrap gap-1 text-[11px] text-ink-muted">
              <dt>已游玩</dt>
              <dd>{library.playedGameCount.toLocaleString("zh-CN")} 款 · 包含玩过的免费游戏</dd>
            </div>
          ) : null}
        </dl>
      ) : (
        <p className="rounded-xl bg-white/35 p-3 text-[11px] leading-relaxed text-ink-muted">
          {reasons[library.reason]}
        </p>
      )}
      {recentGames.availability === "available" ? (
        <section>
          <h3 className="mb-2 text-xs font-bold text-ink-muted">最近两周</h3>
          {recentGames.items.length === 0 ? (
            <p className="text-xs text-ink-muted">最近两周没有游玩记录</p>
          ) : (
            <ul className="space-y-1">
              {recentGames.items.map((game) => (
                <li key={game.appId}>
                  <a
                    href={game.storeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="jelly-control flex items-center justify-between gap-3 rounded-xl bg-white/35 px-3 py-2.5"
                  >
                    <span className="truncate text-xs font-semibold text-ink">{game.name}</span>
                    <span className="shrink-0 text-[11px] tabular-nums text-ink-muted">
                      {hours(game.recentPlaytimeMinutes)}
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : recentGames.reason !== "not_shared" ? (
        <p className="text-[11px] text-ink-muted">{reasons[recentGames.reason]}</p>
      ) : null}
    </div>
  );
}
