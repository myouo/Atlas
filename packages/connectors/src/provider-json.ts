/** Preserve large JSON integers as their exact source spelling, before JS can round them. */
export function parseProviderJson(text: string): unknown {
  let needsFallback = false;
  const parsed: unknown = JSON.parse(
    text,
    (_key: string, value: unknown, context?: { readonly source?: string }) => {
      if (
        typeof value === "number" &&
        (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
      ) {
        if (context?.source !== undefined) return context.source;
        needsFallback = true;
      }
      return value;
    }
  );
  if (!needsFallback) return parsed;
  // The original JSON was validated above; older engines can now safely rewrite numeric tokens.
  const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
  const parts: string[] = [];
  let start = 0;
  for (let index = 0; index < text.length;) {
    const char = text[index];
    if (char === '"') {
      index++;
      while (index < text.length) {
        if (text[index] === "\\") index += 2;
        else if (text[index++] === '"') break;
      }
      continue;
    }
    if (char === "-" || (char !== undefined && char >= "0" && char <= "9")) {
      number.lastIndex = index;
      const match = number.exec(text);
      if (match) {
        const value = Number(match[0]);
        if (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value))) {
          parts.push(text.slice(start, index), JSON.stringify(match[0]));
          start = number.lastIndex;
        }
        index = number.lastIndex;
        continue;
      }
    }
    index++;
  }
  parts.push(text.slice(start));
  return JSON.parse(parts.join("")) as unknown;
}

export async function readProviderJson(response: Response, maxBytes = 5_000_000): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > maxBytes || !response.body) {
    await response.body?.cancel();
    throw new Error("Provider response exceeds its byte limit.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Provider response exceeds its byte limit.");
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return parseProviderJson(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
