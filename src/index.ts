import { api } from "./api";
import { Env } from "./shared";
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request);
    const response = await env.ASSETS.fetch(request); const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store");
    headers.set("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    headers.set("x-frame-options", "DENY"); headers.set("x-content-type-options", "nosniff"); headers.set("referrer-policy", "no-referrer");
    return new Response(response.body, { status: response.status, headers });
  },
} satisfies ExportedHandler<Env>;
