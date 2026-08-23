import Image from "next/image";

import type { WidgetOf } from "../widget-types";

export function ProfileHeroWidget({ widget }: Readonly<{ widget: WidgetOf<"profile.hero"> }>) {
  const { data } = widget;

  return (
    <div className="flex h-full items-center gap-4 px-5 py-3 sm:px-6">
      <div className="relative shrink-0">
        <Image
          alt={`${data.displayName} 的头像`}
          className="h-[80px] w-[80px] rounded-full border-[4px] border-white/85 object-cover shadow-[0_10px_25px_rgba(27,93,171,0.2)] sm:h-[96px] sm:w-[96px]"
          height={160}
          priority
          src={data.avatarUrl}
          width={160}
        />
        <span
          aria-label="在线"
          className="absolute right-1 bottom-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500 sm:h-5 sm:w-5"
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-ink sm:text-[28px]">
            {data.displayName}
          </h2>
          <span className="rounded-full bg-sky-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
            开发者
          </span>
        </div>
        <p className="mt-1 line-clamp-1 max-w-xl text-[11px] leading-relaxed font-medium text-ink-muted sm:text-xs">
          {data.bio}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {data.tags.map((tag, index) => (
            <span
              className={
                index === 1
                  ? "rounded-full border border-pink-200/70 bg-pink-50/85 px-3 py-1 text-[11px] font-semibold text-pink-600"
                  : index === 2
                    ? "rounded-full border border-orange-200/70 bg-orange-50/85 px-3 py-1 text-[11px] font-semibold text-orange-600"
                    : "rounded-full border border-blue-200/70 bg-blue-50/85 px-3 py-1 text-[11px] font-semibold text-blue-600"
              }
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
