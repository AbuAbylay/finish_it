// Calls the real Next.js route handlers in-process, with a session cookie jar. Used by API tests.
import { NextRequest } from "next/server";

type Handler = (req: NextRequest) => Promise<Response>;

export class Client {
  cookie = "";
  constructor(public ip = "10.0.0.1") {}

  async call<T = Record<string, unknown>>(handler: Handler, url: string, init: { method?: string; body?: unknown } = {}) {
    const req = new NextRequest(new URL(url, "http://localhost"), {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": this.ip,
        "x-timezone": "UTC",
        ...(this.cookie ? { cookie: this.cookie } : {}),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const res = await handler(req);
    const set = res.headers.get("set-cookie");
    if (set) this.cookie = set.split(";")[0];
    const data = (await res.json()) as T & { error?: string; code?: string };
    return { status: res.status, data };
  }
}
