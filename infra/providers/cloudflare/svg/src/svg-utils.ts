export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numeric(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function fit(value: string, max: number) {
  const letters = Array.from(value.replace(/[\r\n\t]+/g, " "));
  return letters.length > max ? `${letters.slice(0, max - 1).join("")}…` : letters.join("");
}

export function initials(value: string) {
  return Array.from(value.trim())[0]?.toUpperCase() ?? "N";
}

export function escapeXml(value: string) {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g, "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;"
      })[character]!
  );
}

export function safeHost(value: string) {
  try {
    return new URL(value).host;
  } catch {
    return "About Me";
  }
}

export function formatNumber(value: number) {
  return Math.round(value).toLocaleString("zh-CN");
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${Math.round(minutes)} 分钟`;
  return `${Math.floor(minutes / 60)} 小时 ${Math.round(minutes % 60)} 分`;
}

export function periodLabel(date: string, period: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return period === "week" ? "本周" : "本月";
  return period === "week"
    ? `${date.slice(5)} 起`
    : `${date.slice(0, 4)} 年 ${Number(date.slice(5, 7))} 月`;
}
