#!/usr/bin/env node

import process from "node:process";

const args = process.argv.slice(2);

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return null;
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
Usage: node scripts/sync-edge-providers.mjs [options]

Options:
  --url <url>          Endpoint URL (default: SYNC_ENDPOINT_URL env or https://aboutme.nivalis.is/api/v1/internal/sync)
  --token <token>      Authorization token (default: SYNC_TOKEN or ADMIN_TOKEN env)
  --provider <name>    Optional specific provider to sync (e.g. netease, steam)
  --timeout <ms>       Request timeout in milliseconds (default: 30000)
  --help, -h           Show this help message
`);
  process.exit(0);
}

const defaultEndpoint = "https://aboutme.nivalis.is/api/v1/internal/sync";
const endpointUrl =
  getArgValue("--url") ||
  process.env.SYNC_ENDPOINT_URL?.trim() ||
  (process.env.APP_PUBLIC_ORIGIN
    ? `${process.env.APP_PUBLIC_ORIGIN.replace(/\/+$/, "")}/api/v1/internal/sync`
    : null) ||
  defaultEndpoint;

const token =
  getArgValue("--token") || process.env.SYNC_TOKEN?.trim() || process.env.ADMIN_TOKEN?.trim() || "";

const provider = getArgValue("--provider") || process.env.PROVIDER?.trim();
const timeoutMs = parseInt(getArgValue("--timeout") || "30000", 10);

const targetUrl = new URL(endpointUrl);
if (provider) {
  targetUrl.searchParams.set("provider", provider);
}

console.log(`[Sync Worker] Starting synchronization at ${new Date().toISOString()}`);
console.log(`[Sync Worker] Target URL: ${targetUrl.toString()}`);

const headers = {
  "Content-Type": "application/json",
  "User-Agent": "Nivalis-Sync-Script/1.0"
};

if (token) {
  headers["Authorization"] = `Bearer ${token}`;
  headers["x-sync-token"] = token;
}

const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), timeoutMs);

try {
  const response = await fetch(targetUrl.toString(), {
    headers,
    method: "POST",
    signal: controller.signal
  });
  clearTimeout(timeout);

  const responseText = await response.text();
  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = null;
  }

  if (!response.ok) {
    console.error(`[Sync Worker] HTTP error ${response.status} ${response.statusText}`);
    if (data) {
      console.error(`[Sync Worker] Error detail:`, JSON.stringify(data, null, 2));
    } else {
      console.error(`[Sync Worker] Raw response:`, responseText);
    }
    process.exit(1);
  }

  console.log(`[Sync Worker] Synchronization triggered successfully (status: ${response.status})`);
  if (data?.enqueued && Array.isArray(data.enqueued)) {
    console.log(`[Sync Worker] Enqueued providers (${data.enqueued.length}):`);
    for (const item of data.enqueued) {
      if (item.status === "accepted") {
        console.log(`  ✓ ${item.provider} (run: ${item.syncRunId}, owner: ${item.ownerId})`);
      } else {
        console.warn(`  ✗ ${item.provider} failed: ${item.error}`);
      }
    }
  } else {
    console.log(`[Sync Worker] Response:`, data ?? responseText);
  }
} catch (error) {
  clearTimeout(timeout);
  if (error.name === "AbortError") {
    console.error(`[Sync Worker] Request timed out after ${timeoutMs}ms`);
  } else {
    console.error(`[Sync Worker] Request failed:`, error.message);
  }
  process.exit(1);
}
