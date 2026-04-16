/**
 * fetch() с поддержкой SOCKS5/HTTP прокси через TELEGRAM_PROXY_URL.
 * Нужен для VPS где внешние API (Groq) недоступны напрямую.
 * Всегда использует node-fetch для единообразия (form-data работает корректно).
 */
import { ProxyAgent } from "proxy-agent";
// node-fetch v2 совместим с proxy-agent и с npm form-data
const nodeFetch = require("node-fetch") as typeof fetch;

const PROXY_URL = process.env.TELEGRAM_PROXY_URL?.trim();
const proxyAgent = PROXY_URL ? new ProxyAgent({ getProxyForUrl: () => PROXY_URL! }) : null;

export async function proxyFetch(
  url: string,
  init?: RequestInit & { body?: any }
): Promise<Response> {
  const options: any = { ...init };
  if (proxyAgent) options.agent = proxyAgent;
  return nodeFetch(url, options) as any;
}
