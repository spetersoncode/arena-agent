import type { AppType } from "@arena/backend/app";
import { hc } from "hono/client";

/**
 * Hono RPC client — fully typed from the backend route definitions.
 *
 * In dev, Vite proxies /api/* to the backend (see vite.config.ts).
 * In prod, this would point to the actual API URL.
 *
 * Usage:
 *   const res = await api.arenas.$get();
 *   const data = await res.json();  // fully typed!
 */
export const api = hc<AppType>("/");
