import Image from "next/image";

import type { WidgetOf } from "../widget-types";
import { presentationToggle } from "../widget-presentation";

export function ProfileHeroWidget({ widget }: Readonly<{ widget: WidgetOf<"profile.hero"> }>) {
  const { data } = widget;
  const showAvatar = presentationToggle(widget.presentationConfig, "showAvatar");
  const showDisplayName = presentationToggle(widget.presentationConfig, "showDisplayName");
  const showHandle = presentationToggle(widget.presentationConfig, "showHandle");
  const showHeadline = presentationToggle(widget.presentationConfig, "showHeadline");
  const showBio = presentationToggle(widget.presentationConfig, "showBio");
  const showTags = presentationToggle(widget.presentationConfig, "showTags");
  const showBadge = presentationToggle(widget.presentationConfig, "showBadge");

  return (
    <div className="profile-hero flex h-full items-center gap-4 px-5 py-3">
      {showAvatar ? (
        <div className="relative shrink-0">
          <Image
            alt={`${data.displayName} 的头像`}
            className="profile-hero-avatar h-[96px] w-[96px] rounded-full border-[4px] border-white/85 object-cover shadow-[0_10px_25px_rgba(27,93,171,0.2)]"
            height={160}
            priority
            src={data.avatarUrl}
            width={160}
          />
          <span
            aria-label="在线"
            className="absolute right-1 bottom-1 h-4 w-4 rounded-full border-[3px] border-white bg-emerald-500 sm:h-5 sm:w-5"
            role="img"
          />
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          {showDisplayName ? (
            <h2 className="text-[24px] leading-tight font-extrabold tracking-[-0.03em] text-ink sm:text-[28px]">
              {data.displayName}
            </h2>
          ) : null}
          {showBadge ? (
            <span className="profile-badge rounded-full bg-sky-500 px-3 py-1 text-[11px] font-bold text-white shadow-sm">
              开发者
            </span>
          ) : null}
        </div>
        {showHandle ? (
          <p className="mt-1 text-[11px] font-bold text-blue-600">{data.handle}</p>
        ) : null}
        {showHeadline ? (
          <p className="mt-1 line-clamp-1 text-[11px] font-semibold text-ink-muted">
            {data.headline}
          </p>
        ) : null}
        {showBio ? (
          <p className="mt-1 line-clamp-1 max-w-xl text-[11px] leading-relaxed font-medium text-ink-muted sm:text-xs">
            {data.bio}
          </p>
        ) : null}
        {showTags ? (
          <div className="profile-hero-tags mt-3 flex flex-wrap gap-2">
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
        ) : null}
      </div>
    </div>
  );
}
