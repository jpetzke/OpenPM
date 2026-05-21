import { request, expect, type APIRequestContext } from "@playwright/test";

const BACKEND_URL = process.env.E2E_BACKEND_URL ?? "http://localhost:8000";
const EMAIL = process.env.E2E_USER_EMAIL ?? "demo@openmp.ai";
const PASSWORD = process.env.E2E_USER_PASSWORD ?? "passwort";

let _token: string | null = null;
let _ctx: APIRequestContext | null = null;

async function backend(): Promise<APIRequestContext> {
  if (_ctx) return _ctx;
  _ctx = await request.newContext({ baseURL: BACKEND_URL });
  return _ctx;
}

async function token(): Promise<string> {
  if (_token) return _token;
  const ctx = await backend();
  const r = await ctx.post("/api/auth/login", {
    data: { email: EMAIL, password: PASSWORD },
  });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  _token = body.access_token as string;
  return _token;
}

export async function getOrCreateProjectId(): Promise<string> {
  const ctx = await backend();
  const t = await token();
  const list = await ctx.get("/api/projects", {
    headers: { Authorization: `Bearer ${t}` },
  });
  const projects = (await list.json()) as Array<{ id: string; name: string }>;
  if (projects.length > 0) return projects[0].id;
  const created = await ctx.post("/api/projects", {
    headers: { Authorization: `Bearer ${t}` },
    data: { name: "E2E Test Project" },
  });
  const body = await created.json();
  return body.id as string;
}
