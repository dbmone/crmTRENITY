/**
 * fetch() с поддержкой SOCKS5/HTTP прокси через TELEGRAM_PROXY_URL.
 * Нужен для VPS где внешние API (Groq) недоступны напрямую.
 */
import { ProxyAgent } from "proxy-agent";
// node-fetch v2 совместим с proxy-agent
const nodeFetch = require("node-fetch") as typeof fetch;

const PROXY_URL = process.env.TELEGRAM_PROXY_URL?.trim();
const proxyAgent = PROXY_URL ? new ProxyAgent({ getProxyForUrl: () => PROXY_URL! }) : null;

export async function proxyFetch(
  url: string,
  init?: RequestInit & { body?: any }
): Promise<Response> {
  if (proxyAgent) {
    return nodeFetch(url, { ...init, agent: proxyAgent } as any) as any;
  }
  return fetch(url, init as any);
}
