# OpenPM Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete OpenPM frontend — a dark, keyboard-first project management UI connecting to the existing FastAPI backend.

**Architecture:** Next.js 15 App Router, Tailwind CSS v4, shadcn/ui components, Zustand for auth/pipeline state, TanStack Query v5 for server state, native EventSource for SSE, native fetch ReadableStream for chat streaming.

**Tech Stack:** Next.js 15, Tailwind CSS v4, shadcn/ui, Framer Motion, Lucide React, Zustand, TanStack Query v5, React Hook Form, Zod, Sonner (toasts), react-markdown

---

## API Reference (backend at http://localhost:8000)

```
POST   /auth/register              body: {email, password, name}    → UserResponse
POST   /auth/login                 body: {email, password}          → {access_token, token_type}
POST   /auth/logout                header: Bearer token             → 204
GET    /auth/me                    header: Bearer token             → UserResponse

GET    /api/projects               → ProjectResponse[]
POST   /api/projects               body: {name, client_name}        → ProjectResponse
GET    /api/projects/:id           → ProjectResponse
PATCH  /api/projects/:id           body: {name?, client_name?, status?} → ProjectResponse
DELETE /api/projects/:id           → 204

POST   /api/projects/:id/documents multipart file                   → DocumentResponse
GET    /api/projects/:id/documents → DocumentResponse[]
POST   /api/projects/:id/documents/text body: {content, title}      → DocumentResponse
GET    /api/projects/:id/documents/:docId → DocumentResponse
GET    /api/projects/:id/documents/:docId/download → binary
DELETE /api/projects/:id/documents/:docId → 204
POST   /api/projects/:id/documents/:docId/reprocess → DocumentResponse

GET    /api/projects/:id/state     → ProjectStateResponse
GET    /api/projects/:id/state/history?limit&offset → StateChangelogResponse[]
GET    /api/projects/:id/state/diff?from_version&to_version → delta dict
GET    /api/projects/:id/state/:version → ProjectStateResponse
PATCH  /api/projects/:id/state/tasks/:taskId body: {status} → ProjectStateResponse

POST   /api/projects/:id/chat      body: {content} stream → SSE events
GET    /api/projects/:id/chat/history?limit&before → ChatMessageResponse[]
DELETE /api/projects/:id/chat/history → 204

GET    /api/projects/:id/events    → SSE stream
```

SSE event shapes from /events:
```json
{"type": "connected"}
{"event": "pipeline_started", "document_id": "uuid"}
{"event": "pipeline_complete", "document_id": "uuid"}
{"event": "pipeline_failed", "document_id": "uuid", "error": "..."}
```

Chat SSE shapes from POST /chat:
```json
{"type": "tool_call", "tools": ["search_documents"]}
{"type": "content", "text": "...full response..."}
{"type": "error", "message": "..."}
"[DONE]"
```

ProjectResponse shape:
```typescript
{ id: string, name: string, client_name: string, status: string,
  compiled_briefing: string | null, created_at: string, updated_at: string, created_by: string }
```

DocumentResponse shape:
```typescript
{ id: string, project_id: string, original_filename: string, original_path: string,
  mime_type: string, file_size: number, processing_status: "pending"|"processing"|"done"|"failed",
  processing_error: string | null, git_commit_hash: string | null,
  uploaded_by: string, uploaded_at: string }
```

ProjectStateResponse shape:
```typescript
{ id: string, project_id: string, version: number, state: StateData,
  triggered_by_document_id: string | null, created_at: string }
```

StateData shape:
```typescript
{
  core?: { open_tasks?: Task[] }
  contacts?: Contact[]
  blockers?: Blocker[]
  decisions?: Decision[]
}
Task: { id: string, title: string, status: "open"|"done"|"blocked", deadline?: string, source?: string }
Contact: { name: string, role: string, email?: string }
Blocker: { description: string, severity: "high"|"medium"|"low", days_since?: number }
Decision: { date: string, description: string }
```

StateChangelogResponse shape:
```typescript
{ id: string, project_id: string, from_version: number|null, to_version: number,
  delta: object, document_id: string|null, triggered_by: string,
  git_commit_hash: string|null, created_at: string }
```

ChatMessageResponse shape:
```typescript
{ id: string, project_id: string, user_id: string|null, role: "user"|"assistant",
  content: string, tool_calls: object|null, tool_results: object|null,
  state_version: number|null, created_at: string }
```

---

## File Map

```
frontend/
├── package.json
├── next.config.ts
├── tailwind.config.ts          (minimal — v4 uses CSS)
├── components.json             (shadcn config)
├── tsconfig.json
├── src/
│   ├── app/
│   │   ├── globals.css         (CSS vars + Tailwind v4 imports)
│   │   ├── layout.tsx          (root layout: font, providers, Toaster)
│   │   ├── page.tsx            (redirect to /projects)
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── projects/
│   │       ├── page.tsx        (project list)
│   │       └── [id]/
│   │           ├── layout.tsx  (shell: sidebar + header + SSE init)
│   │           ├── upload/page.tsx
│   │           ├── state/page.tsx
│   │           └── chat/page.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── AppSidebar.tsx
│   │   │   ├── ProjectHeader.tsx
│   │   │   ├── ProjectTabs.tsx
│   │   │   └── CommandPalette.tsx
│   │   ├── upload/
│   │   │   ├── DropZone.tsx
│   │   │   ├── TextPasteModal.tsx
│   │   │   └── DocumentList.tsx
│   │   ├── state/
│   │   │   ├── StateGrid.tsx
│   │   │   ├── TaskCard.tsx
│   │   │   ├── ContactCard.tsx
│   │   │   ├── BlockerCard.tsx
│   │   │   ├── DecisionCard.tsx
│   │   │   └── StateTimeline.tsx
│   │   ├── chat/
│   │   │   ├── ChatInterface.tsx
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── SourcePill.tsx
│   │   │   └── ChatInput.tsx
│   │   └── providers/
│   │       └── QueryProvider.tsx
│   ├── hooks/
│   │   ├── useProjectSSE.ts
│   │   ├── useOptimisticTask.ts
│   │   └── useChatStream.ts
│   ├── lib/
│   │   ├── api.ts
│   │   ├── queryClient.ts
│   │   └── utils.ts
│   ├── store/
│   │   ├── authStore.ts
│   │   └── pipelineStore.ts
│   └── types/
│       ├── project.ts
│       ├── document.ts
│       ├── state.ts
│       └── chat.ts
```

---

## Task 1: Scaffold Next.js 15 project

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/next.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/components.json`
- Create: `frontend/tailwind.config.ts`
- Create: `frontend/src/app/globals.css`
- Create: `frontend/src/lib/utils.ts`

- [ ] **Step 1: Initialize Next.js project in frontend dir**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npx create-next-app@latest . --typescript --tailwind --app --no-src-dir --import-alias "@/*" --yes
```

Wait for completion.

- [ ] **Step 2: Move src layout (create-next-app uses no-src by default without flag — adjust)**

Actually use this exact command to get src/ directory:
```bash
cd /home/jonas/Projects/OpenPM/frontend
npx create-next-app@15 . --typescript --tailwind --app --src-dir --import-alias "@/*" --eslint --yes
```

- [ ] **Step 3: Install core dependencies**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npm install zustand @tanstack/react-query framer-motion lucide-react react-hook-form zod @hookform/resolvers sonner react-markdown
npm install -D @types/node
```

- [ ] **Step 4: Install shadcn/ui**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npx shadcn@latest init --defaults
```

When prompted, choose: Dark theme, CSS variables yes.

- [ ] **Step 5: Add needed shadcn components**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npx shadcn@latest add button input label textarea dialog badge toast separator skeleton scroll-area command popover dropdown-menu checkbox tooltip
```

- [ ] **Step 6: Set up globals.css with design system CSS vars**

Replace `src/app/globals.css` content:

```css
@import "tailwindcss";

:root {
  --bg-base:       #0A0A0B;
  --bg-surface:    #111113;
  --bg-elevated:   #18181C;
  --bg-overlay:    #1F1F26;
  --border:        #1F1F23;
  --border-strong: #2C2C32;
  --text-primary:  #EDEDEF;
  --text-secondary:#9898A6;
  --text-muted:    #6B6B7B;
  --text-disabled: #3C3C46;
  --accent:        #6366F1;
  --accent-hover:  #4F52D9;
  --accent-subtle: rgba(99, 102, 241, 0.08);
  --success:       #22C55E;
  --success-subtle:rgba(34, 197, 94, 0.08);
  --warning:       #F59E0B;
  --warning-subtle:rgba(245, 158, 11, 0.08);
  --danger:        #EF4444;
  --danger-subtle: rgba(239, 68, 68, 0.08);
  --sidebar-width: 240px;

  /* shadcn overrides for dark theme */
  --background: #0A0A0B;
  --foreground: #EDEDEF;
  --card: #111113;
  --card-foreground: #EDEDEF;
  --popover: #1F1F26;
  --popover-foreground: #EDEDEF;
  --primary: #6366F1;
  --primary-foreground: #ffffff;
  --secondary: #18181C;
  --secondary-foreground: #EDEDEF;
  --muted: #18181C;
  --muted-foreground: #6B6B7B;
  --accent: #18181C;
  --accent-foreground: #EDEDEF;
  --destructive: #EF4444;
  --destructive-foreground: #ffffff;
  --border: #1F1F23;
  --input: #1F1F23;
  --ring: #6366F1;
  --radius: 0.375rem;
}

* {
  box-sizing: border-box;
  border-color: var(--border);
}

body {
  background-color: var(--bg-base);
  color: var(--text-primary);
  font-family: var(--font-geist-sans), -apple-system, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

.transition-default {
  transition: all 150ms ease;
}

.transition-slow {
  transition: all 250ms ease;
}
```

- [ ] **Step 7: Update next.config.ts**

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${process.env.API_URL || "http://localhost:8000"}/api/:path*`,
      },
      {
        source: "/auth/:path*",
        destination: `${process.env.API_URL || "http://localhost:8000"}/auth/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 8: Update root layout with Geist font and providers**

Write `src/app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Toaster } from "sonner";
import { QueryProvider } from "@/components/providers/QueryProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenPM",
  description: "Project Management",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="dark">
      <body className={`${GeistSans.variable} ${GeistMono.variable}`}>
        <QueryProvider>
          {children}
        </QueryProvider>
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg-overlay)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-primary)",
              fontSize: "13px",
            },
          }}
        />
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Install geist font package**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npm install geist
```

- [ ] **Step 10: Commit scaffold**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/
git commit -m "feat(frontend): scaffold Next.js 15 with shadcn, Tailwind v4, dependencies"
```

---

## Task 2: Types + API client + Zustand stores

**Files:**
- Create: `frontend/src/types/project.ts`
- Create: `frontend/src/types/document.ts`
- Create: `frontend/src/types/state.ts`
- Create: `frontend/src/types/chat.ts`
- Create: `frontend/src/store/authStore.ts`
- Create: `frontend/src/store/pipelineStore.ts`
- Create: `frontend/src/lib/api.ts`
- Create: `frontend/src/lib/queryClient.ts`
- Create: `frontend/src/lib/utils.ts`
- Create: `frontend/src/components/providers/QueryProvider.tsx`

- [ ] **Step 1: Write types/project.ts**

```typescript
export interface Project {
  id: string;
  name: string;
  client_name: string;
  status: string;
  compiled_briefing: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: string;
  joined_at: string;
}

export interface User {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
}
```

- [ ] **Step 2: Write types/document.ts**

```typescript
export type DocumentStatus = "pending" | "processing" | "done" | "failed";

export interface Document {
  id: string;
  project_id: string;
  original_filename: string;
  original_path: string;
  mime_type: string;
  file_size: number;
  processing_status: DocumentStatus;
  processing_error: string | null;
  git_commit_hash: string | null;
  uploaded_by: string;
  uploaded_at: string;
}
```

- [ ] **Step 3: Write types/state.ts**

```typescript
export interface Task {
  id: string;
  title: string;
  status: "open" | "done" | "blocked";
  deadline?: string;
  source?: string;
}

export interface Contact {
  name: string;
  role: string;
  email?: string;
}

export interface Blocker {
  description: string;
  severity: "high" | "medium" | "low";
  days_since?: number;
}

export interface Decision {
  date: string;
  description: string;
}

export interface StateData {
  core?: { open_tasks?: Task[] };
  contacts?: Contact[];
  blockers?: Blocker[];
  decisions?: Decision[];
}

export interface ProjectState {
  id: string;
  project_id: string;
  version: number;
  state: StateData;
  triggered_by_document_id: string | null;
  created_at: string;
}

export interface StateChangelog {
  id: string;
  project_id: string;
  from_version: number | null;
  to_version: number;
  delta: Record<string, unknown>;
  document_id: string | null;
  triggered_by: string;
  git_commit_hash: string | null;
  created_at: string;
}
```

- [ ] **Step 4: Write types/chat.ts**

```typescript
export interface ChatMessage {
  id: string;
  project_id: string;
  user_id: string | null;
  role: "user" | "assistant";
  content: string;
  tool_calls: Record<string, unknown> | null;
  tool_results: Record<string, unknown> | null;
  state_version: number | null;
  created_at: string;
}
```

- [ ] **Step 5: Write store/authStore.ts**

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types/project";

interface AuthState {
  user: User | null;
  token: string | null;
  setAuth: (user: User, token: string) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => set({ user, token }),
      clearAuth: () => set({ user: null, token: null }),
    }),
    { name: "openpm-auth" }
  )
);
```

- [ ] **Step 6: Write store/pipelineStore.ts**

```typescript
import { create } from "zustand";
import type { DocumentStatus } from "@/types/document";

interface PipelineState {
  pipelines: Record<string, DocumentStatus>;
  setPipelineStatus: (documentId: string, status: DocumentStatus) => void;
  clearPipeline: (documentId: string) => void;
}

export const usePipelineStore = create<PipelineState>()((set) => ({
  pipelines: {},
  setPipelineStatus: (documentId, status) =>
    set((s) => ({ pipelines: { ...s.pipelines, [documentId]: status } })),
  clearPipeline: (documentId) =>
    set((s) => {
      const { [documentId]: _, ...rest } = s.pipelines;
      return { pipelines: rest };
    }),
}));
```

- [ ] **Step 7: Write lib/api.ts**

```typescript
import { useAuthStore } from "@/store/authStore";
import { toast } from "sonner";

const BASE = "";

export interface ApiError {
  status: number;
  message: string;
  detail?: string;
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = useAuthStore.getState().token;
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(`${BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    useAuthStore.getState().clearAuth();
    window.location.href = "/login";
    throw { status: 401, message: "Unauthorized" } as ApiError;
  }
  if (res.status === 403) {
    toast.error("Keine Berechtigung");
    throw { status: 403, message: "Forbidden" } as ApiError;
  }
  if (res.status === 413) {
    toast.error("Datei zu groß (max. 50MB)");
    throw { status: 413, message: "File too large" } as ApiError;
  }
  if (res.status >= 500) {
    toast.error("Serverfehler, bitte erneut versuchen");
    throw { status: res.status, message: "Server error" } as ApiError;
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw { status: res.status, message: body.detail || "Request failed", detail: body.detail } as ApiError;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: "POST", body: formData }),
  getToken: () => useAuthStore.getState().token,
};
```

- [ ] **Step 8: Write lib/queryClient.ts**

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});
```

- [ ] **Step 9: Write lib/utils.ts**

```typescript
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return "gerade eben";
  if (minutes < 60) return `vor ${minutes}m`;
  if (hours < 24) return `vor ${hours}h`;
  return `vor ${days}d`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
  });
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}
```

- [ ] **Step 10: Write components/providers/QueryProvider.tsx**

```typescript
"use client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

- [ ] **Step 11: Install clsx + tailwind-merge if not present**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npm install clsx tailwind-merge
```

- [ ] **Step 12: Write root page.tsx as redirect**

```typescript
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/projects");
}
```

- [ ] **Step 13: Commit types and infrastructure**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/
git commit -m "feat(frontend): types, API client, Zustand stores, QueryProvider"
```

---

## Task 3: Auth pages — Login + Register

**Files:**
- Create: `frontend/src/app/(auth)/login/page.tsx`
- Create: `frontend/src/app/(auth)/register/page.tsx`

- [ ] **Step 1: Write login page**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const schema = z.object({
  email: z.string().email("Ungültige E-Mail"),
  password: z.string().min(1, "Passwort erforderlich"),
});
type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const { access_token } = await api.post<{ access_token: string; token_type: string }>(
        "/auth/login",
        { email: data.email, password: data.password }
      );
      const user = await api.get<import("@/types/project").User>("/auth/me");
      setAuth(user, access_token);
      router.push("/projects");
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message || "Anmeldung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>OpenPM</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Anmelden</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              {...register("email")}
              className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--accent)",
              } as React.CSSProperties}
              placeholder="name@firma.de"
            />
            {errors.email && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Passwort
            </label>
            <input
              id="password"
              type="password"
              {...register("password")}
              className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1"
              style={{
                background: "var(--bg-surface)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
                "--tw-ring-color": "var(--accent)",
              } as React.CSSProperties}
              placeholder="••••••••"
            />
            {errors.password && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.password.message}</p>}
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-md text-sm font-medium transition-default disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {loading ? "..." : "Anmelden"}
          </button>
        </form>
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Noch kein Konto?{" "}
          <Link href="/register" style={{ color: "var(--accent)" }}>Registrieren</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write register page**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const schema = z.object({
  name: z.string().min(1, "Name erforderlich"),
  email: z.string().email("Ungültige E-Mail"),
  password: z.string().min(8, "Mindestens 8 Zeichen"),
});
type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      await api.post("/auth/register", { email: data.email, password: data.password, name: data.name });
      const { access_token } = await api.post<{ access_token: string; token_type: string }>(
        "/auth/login",
        { email: data.email, password: data.password }
      );
      const user = await api.get<import("@/types/project").User>("/auth/me");
      setAuth(user, access_token);
      router.push("/projects");
    } catch (err: unknown) {
      const e = err as { message?: string };
      toast.error(e.message || "Registrierung fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-sm space-y-6 p-8">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>OpenPM</h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>Konto erstellen</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="name" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Name</label>
            <input id="name" type="text" {...register("name")}
              className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" } as React.CSSProperties}
              placeholder="Max Mustermann" />
            {errors.name && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>E-Mail</label>
            <input id="email" type="email" {...register("email")}
              className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" } as React.CSSProperties}
              placeholder="name@firma.de" />
            {errors.email && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.email.message}</p>}
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>Passwort</label>
            <input id="password" type="password" {...register("password")}
              className="w-full px-3 py-2 rounded-md text-sm outline-none focus:ring-1"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border)", color: "var(--text-primary)" } as React.CSSProperties}
              placeholder="••••••••" />
            {errors.password && <p className="text-xs" style={{ color: "var(--danger)" }}>{errors.password.message}</p>}
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 rounded-md text-sm font-medium transition-default disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#fff" }}>
            {loading ? "..." : "Registrieren"}
          </button>
        </form>
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Bereits registriert?{" "}
          <Link href="/login" style={{ color: "var(--accent)" }}>Anmelden</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit auth pages**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/app/(auth)/
git commit -m "feat(frontend): login and register pages"
```

---

## Task 4: Projects list page

**Files:**
- Create: `frontend/src/app/projects/page.tsx`

- [ ] **Step 1: Write projects/page.tsx**

```typescript
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/types/project";

export default function ProjectsPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", client_name: "" });

  if (!token) {
    router.push("/login");
    return null;
  }

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; client_name: string }) =>
      api.post<Project>("/api/projects", data),
    onSuccess: (project) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setCreating(false);
      setForm({ name: "", client_name: "" });
      router.push(`/projects/${project.id}/upload`);
    },
    onError: () => toast.error("Projekt konnte nicht erstellt werden"),
  });

  const statusColor = (status: string) => {
    if (status === "active") return "var(--success)";
    if (status === "paused") return "var(--warning)";
    return "var(--text-disabled)";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold" style={{ color: "var(--text-primary)" }}>Projekte</h1>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-default"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            <Plus size={14} />
            Neues Projekt
          </button>
        </div>

        {creating && (
          <div className="mb-6 p-4 rounded-lg border" style={{ background: "var(--bg-surface)", borderColor: "var(--border-strong)" }}>
            <div className="flex gap-3">
              <input
                autoFocus
                placeholder="Projektname"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <input
                placeholder="Kundenname"
                value={form.client_name}
                onChange={(e) => setForm((f) => ({ ...f, client_name: e.target.value }))}
                className="flex-1 px-3 py-1.5 rounded-md text-sm outline-none"
                style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
              />
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={!form.name || !form.client_name || createMutation.isPending}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-default disabled:opacity-50"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                Erstellen
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-1.5 rounded-md text-sm transition-default"
                style={{ color: "var(--text-muted)" }}
              >
                Abbrechen
              </button>
            </div>
          </div>
        )}

        {!projects?.length ? (
          <div className="text-center py-24 space-y-3">
            <p style={{ color: "var(--text-secondary)" }}>Noch keine Projekte.</p>
            <button
              onClick={() => setCreating(true)}
              className="px-4 py-2 rounded-md text-sm font-medium transition-default"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              + Erstes Projekt anlegen
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}/upload`)}
                className="text-left p-4 rounded-lg border transition-default hover:border-[var(--border-strong)]"
                style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>{p.name}</p>
                    <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>{p.client_name}</p>
                  </div>
                  <span
                    className="text-xs px-2 py-0.5 rounded-sm"
                    style={{
                      background: statusColor(p.status) + "20",
                      color: statusColor(p.status),
                    }}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
                  Letztes Update: {formatRelativeTime(p.updated_at)}
                </p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit projects page**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/app/projects/page.tsx
git commit -m "feat(frontend): projects list page with create inline form"
```

---

## Task 5: Hooks — SSE, chat stream, optimistic task

**Files:**
- Create: `frontend/src/hooks/useProjectSSE.ts`
- Create: `frontend/src/hooks/useChatStream.ts`
- Create: `frontend/src/hooks/useOptimisticTask.ts`

- [ ] **Step 1: Write hooks/useProjectSSE.ts**

```typescript
"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { usePipelineStore } from "@/store/pipelineStore";

export function useProjectSSE(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus);
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!token || !projectId) return;

    const url = `/api/projects/${projectId}/events`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.event) {
          case "pipeline_started":
            setPipelineStatus(data.document_id, "processing");
            qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
            break;
          case "pipeline_complete":
            setPipelineStatus(data.document_id, "done");
            qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
            qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
            break;
          case "pipeline_failed":
            setPipelineStatus(data.document_id, "failed");
            qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
            toast.error(`Verarbeitung fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
            break;
        }
      } catch {}
    };

    es.onerror = () => {};

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [projectId, token]);
}
```

Note: EventSource doesn't support custom headers natively. The backend uses `get_project_member` which reads the token from the auth dependency. Since we can't pass headers via EventSource, we'll need the backend to accept the token as a query param OR we use a workaround. Looking at the backend events router: it uses `get_project_member` which calls `get_current_user` which reads from `Authorization` header. We'll use a fetch-based SSE instead.

- [ ] **Step 2: Rewrite useProjectSSE.ts with fetch-based SSE (no native EventSource — supports auth)**

```typescript
"use client";
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuthStore } from "@/store/authStore";
import { usePipelineStore } from "@/store/pipelineStore";

export function useProjectSSE(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const setPipelineStatus = usePipelineStore((s) => s.setPipelineStatus);
  const qc = useQueryClient();
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!token || !projectId) return;

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;
            try {
              const data = JSON.parse(raw);
              switch (data.event) {
                case "pipeline_started":
                  setPipelineStatus(data.document_id, "processing");
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                  break;
                case "pipeline_complete":
                  setPipelineStatus(data.document_id, "done");
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
                  break;
                case "pipeline_failed":
                  setPipelineStatus(data.document_id, "failed");
                  qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
                  toast.error(`Verarbeitung fehlgeschlagen: ${data.error || "Unbekannter Fehler"}`);
                  break;
              }
            } catch {}
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {}
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [projectId, token]);
}
```

- [ ] **Step 3: Write hooks/useChatStream.ts**

```typescript
"use client";
import { useState, useCallback } from "react";
import { useAuthStore } from "@/store/authStore";
import type { ChatMessage } from "@/types/chat";

interface StreamState {
  streaming: boolean;
  streamingText: string;
}

export function useChatStream(projectId: string) {
  const token = useAuthStore((s) => s.token);
  const [state, setState] = useState<StreamState>({ streaming: false, streamingText: "" });

  const sendMessage = useCallback(
    async (
      content: string,
      onComplete: (assistantMessage: string) => void
    ) => {
      setState({ streaming: true, streamingText: "" });
      try {
        const res = await fetch(`/api/projects/${projectId}/chat`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ content }),
        });
        if (!res.ok || !res.body) {
          setState({ streaming: false, streamingText: "" });
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") {
              setState({ streaming: false, streamingText: "" });
              onComplete(fullText);
              return;
            }
            try {
              const data = JSON.parse(raw);
              if (data.type === "content") {
                fullText = data.text;
                setState({ streaming: true, streamingText: fullText });
              }
            } catch {}
          }
        }
      } catch {}
      setState({ streaming: false, streamingText: "" });
    },
    [projectId, token]
  );

  return { ...state, sendMessage };
}
```

- [ ] **Step 4: Write hooks/useOptimisticTask.ts**

```typescript
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ProjectState } from "@/types/state";

export function useOptimisticTask(projectId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ taskId, status }: { taskId: string; status: string }) =>
      api.patch<ProjectState>(`/api/projects/${projectId}/state/tasks/${taskId}`, { status }),

    onMutate: async ({ taskId, status }) => {
      await qc.cancelQueries({ queryKey: ["projects", projectId, "state"] });
      const previous = qc.getQueryData<ProjectState>(["projects", projectId, "state"]);
      qc.setQueryData<ProjectState>(["projects", projectId, "state"], (old) => {
        if (!old) return old;
        return {
          ...old,
          state: {
            ...old.state,
            core: {
              ...old.state.core,
              open_tasks: old.state.core?.open_tasks?.map((t) =>
                t.id === taskId ? { ...t, status: status as "open" | "done" | "blocked" } : t
              ),
            },
          },
        };
      });
      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(["projects", projectId, "state"], ctx.previous);
      }
      toast.error("Task-Update fehlgeschlagen");
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "state"] });
    },
  });
}
```

- [ ] **Step 5: Commit hooks**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/hooks/
git commit -m "feat(frontend): SSE hook, chat stream hook, optimistic task hook"
```

---

## Task 6: Layout components — AppSidebar, ProjectHeader, ProjectTabs, CommandPalette

**Files:**
- Create: `frontend/src/components/layout/AppSidebar.tsx`
- Create: `frontend/src/components/layout/ProjectHeader.tsx`
- Create: `frontend/src/components/layout/ProjectTabs.tsx`
- Create: `frontend/src/components/layout/CommandPalette.tsx`

- [ ] **Step 1: Write AppSidebar.tsx**

```typescript
"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, LogOut, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { usePipelineStore } from "@/store/pipelineStore";
import type { Project } from "@/types/project";

function statusDotColor(status: string) {
  if (status === "active") return "var(--success)";
  if (status === "paused") return "var(--warning)";
  return "var(--text-disabled)";
}

interface AppSidebarProps {
  currentProjectId?: string;
}

export function AppSidebar({ currentProjectId }: AppSidebarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, clearAuth, token } = useAuthStore();
  const pipelines = usePipelineStore((s) => s.pipelines);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
    enabled: !!token,
  });

  const sorted = [...(projects ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  const handleLogout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    clearAuth();
    router.push("/login");
  };

  const hasProcessing = (projectId: string) =>
    Object.values(pipelines).some((s) => s === "processing");

  return (
    <aside
      className="flex flex-col h-full shrink-0"
      style={{
        width: "var(--sidebar-width)",
        background: "var(--bg-surface)",
        borderRight: "1px solid var(--border)",
      }}
    >
      <div className="px-4 py-4 border-b" style={{ borderColor: "var(--border)" }}>
        <Link href="/projects">
          <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>OpenPM</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        <div className="px-3 mb-1">
          <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Projekte
          </span>
        </div>
        {sorted.map((p) => {
          const isActive = p.id === currentProjectId;
          const isProcessing = Object.keys(pipelines).some(
            (docId) => pipelines[docId] === "processing"
          ) && isActive;
          return (
            <Link
              key={p.id}
              href={`/projects/${p.id}/upload`}
              className="flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-sm transition-default"
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "var(--bg-elevated)" : "transparent",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: statusDotColor(p.status) }}
              />
              <span className="flex-1 truncate">{p.name}</span>
              {isProcessing && (
                <Loader2 size={12} className="animate-spin shrink-0" style={{ color: "var(--text-muted)" }} />
              )}
            </Link>
          );
        })}

        <Link
          href="/projects"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-sm mt-1 transition-default"
          style={{ color: "var(--text-muted)" }}
        >
          <Plus size={14} />
          <span>Neues Projekt</span>
        </Link>
      </nav>

      <div className="px-3 py-3 border-t flex items-center gap-2" style={{ borderColor: "var(--border)" }}>
        <div className="flex-1 min-w-0">
          <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
            {user?.name || user?.email || "—"}
          </p>
        </div>
        <button onClick={handleLogout} className="p-1 rounded transition-default hover:opacity-70">
          <LogOut size={14} style={{ color: "var(--text-muted)" }} />
        </button>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Write ProjectHeader.tsx**

```typescript
"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import type { Project } from "@/types/project";
import { ProjectTabs } from "./ProjectTabs";

interface ProjectHeaderProps {
  project: Project;
}

const STATUS_OPTIONS = ["active", "paused", "archived"] as const;

function statusLabel(s: string) {
  if (s === "active") return "aktiv";
  if (s === "paused") return "pausiert";
  return "archiviert";
}

export function ProjectHeader({ project }: ProjectHeaderProps) {
  const qc = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (status: string) =>
      api.patch<Project>(`/api/projects/${project.id}`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects", project.id] });
    },
    onError: () => toast.error("Status-Update fehlgeschlagen"),
  });

  return (
    <div
      className="shrink-0 border-b"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="px-6 pt-4 pb-0">
        <div className="flex items-center justify-between mb-0.5">
          <h1 className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>
            {project.name}
          </h1>
          <div className="relative group">
            <button
              className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-default"
              style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{
                background: project.status === "active" ? "var(--success)" : project.status === "paused" ? "var(--warning)" : "var(--text-disabled)"
              }} />
              {statusLabel(project.status)}
              <ChevronDown size={12} />
            </button>
            <div
              className="absolute right-0 mt-1 w-32 rounded-md border py-1 z-50 hidden group-hover:block"
              style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
            >
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => updateMutation.mutate(s)}
                  className="w-full text-left px-3 py-1.5 text-xs transition-default hover:bg-[var(--bg-elevated)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {statusLabel(s)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          {project.client_name} · Letztes Update: {formatRelativeTime(project.updated_at)}
        </p>
        <ProjectTabs projectId={project.id} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write ProjectTabs.tsx**

```typescript
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface ProjectTabsProps {
  projectId: string;
}

const TABS = [
  { label: "Upload", path: "upload" },
  { label: "State", path: "state" },
  { label: "Chat", path: "chat" },
];

export function ProjectTabs({ projectId }: ProjectTabsProps) {
  const pathname = usePathname();

  return (
    <div className="flex gap-0 border-b -mx-6 px-6" style={{ borderColor: "transparent" }}>
      {TABS.map(({ label, path }) => {
        const href = `/projects/${projectId}/${path}`;
        const isActive = pathname === href;
        return (
          <Link
            key={path}
            href={href}
            className="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-default"
            style={{
              color: isActive ? "var(--text-primary)" : "var(--text-muted)",
              borderBottomColor: isActive ? "var(--accent)" : "transparent",
            }}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write CommandPalette.tsx**

```typescript
"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import type { Project } from "@/types/project";

interface CommandPaletteProps {
  currentProjectId?: string;
}

export function CommandPalette({ currentProjectId }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  const { data: projects } = useQuery<Project[]>({
    queryKey: ["projects"],
    queryFn: () => api.get<Project[]>("/api/projects"),
    enabled: !!token && open,
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const filtered = (projects ?? []).filter((p) =>
    p.name.toLowerCase().includes(query.toLowerCase()) ||
    p.client_name.toLowerCase().includes(query.toLowerCase())
  );

  const ACTIONS = [
    { label: "Upload", action: () => currentProjectId && router.push(`/projects/${currentProjectId}/upload`) },
    { label: "State", action: () => currentProjectId && router.push(`/projects/${currentProjectId}/state`) },
    { label: "Chat", action: () => currentProjectId && router.push(`/projects/${currentProjectId}/chat`) },
    { label: "Alle Projekte", action: () => router.push("/projects") },
  ];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-24"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b" style={{ borderColor: "var(--border)" }}>
          <Search size={16} style={{ color: "var(--text-muted)" }} />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Suchen..."
            className="flex-1 py-3 text-sm bg-transparent outline-none"
            style={{ color: "var(--text-primary)" }}
          />
          <kbd className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--bg-elevated)", color: "var(--text-muted)" }}>
            Esc
          </kbd>
        </div>
        <div className="py-2 max-h-80 overflow-y-auto">
          {!query && (
            <div className="px-3 mb-1">
              <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                Aktionen
              </span>
            </div>
          )}
          {!query && ACTIONS.map((a) => (
            <button
              key={a.label}
              onClick={() => { a.action(); setOpen(false); }}
              className="w-full text-left px-4 py-2 text-sm transition-default hover:bg-[var(--bg-elevated)]"
              style={{ color: "var(--text-secondary)" }}
            >
              {a.label}
            </button>
          ))}
          {filtered.length > 0 && (
            <>
              <div className="px-3 mt-2 mb-1">
                <span className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Projekte
                </span>
              </div>
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { router.push(`/projects/${p.id}/upload`); setOpen(false); }}
                  className="w-full text-left px-4 py-2 text-sm transition-default hover:bg-[var(--bg-elevated)]"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {p.name}
                  <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>{p.client_name}</span>
                </button>
              ))}
            </>
          )}
          {query && filtered.length === 0 && (
            <p className="px-4 py-3 text-sm" style={{ color: "var(--text-muted)" }}>Keine Ergebnisse</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit layout components**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/components/layout/
git commit -m "feat(frontend): layout components - sidebar, header, tabs, command palette"
```

---

## Task 7: Project shell layout

**Files:**
- Create: `frontend/src/app/projects/[id]/layout.tsx`

- [ ] **Step 1: Write projects/[id]/layout.tsx**

```typescript
"use client";
import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useProjectSSE } from "@/hooks/useProjectSSE";
import { AppSidebar } from "@/components/layout/AppSidebar";
import { ProjectHeader } from "@/components/layout/ProjectHeader";
import { CommandPalette } from "@/components/layout/CommandPalette";
import type { Project } from "@/types/project";

export default function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const token = useAuthStore((s) => s.token);

  useProjectSSE(id);

  useEffect(() => {
    if (!token) router.push("/login");
  }, [token]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === "1") { e.preventDefault(); router.push(`/projects/${id}/upload`); }
      if (e.key === "2") { e.preventDefault(); router.push(`/projects/${id}/state`); }
      if (e.key === "3") { e.preventDefault(); router.push(`/projects/${id}/chat`); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [id]);

  const { data: project, isLoading } = useQuery<Project>({
    queryKey: ["projects", id],
    queryFn: () => api.get<Project>(`/api/projects/${id}`),
    enabled: !!token,
  });

  if (!token) return null;

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
      <AppSidebar currentProjectId={id} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {project && <ProjectHeader project={project} />}
        {isLoading && !project && (
          <div className="h-16 border-b animate-pulse" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }} />
        )}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette currentProjectId={id} />
    </div>
  );
}
```

- [ ] **Step 2: Commit layout**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/app/projects/
git commit -m "feat(frontend): project shell layout with sidebar, SSE init, keyboard shortcuts"
```

---

## Task 8: Upload tab — DropZone, TextPasteModal, DocumentList

**Files:**
- Create: `frontend/src/components/upload/DropZone.tsx`
- Create: `frontend/src/components/upload/TextPasteModal.tsx`
- Create: `frontend/src/components/upload/DocumentList.tsx`
- Create: `frontend/src/app/projects/[id]/upload/page.tsx`

- [ ] **Step 1: Write DropZone.tsx**

```typescript
"use client";
import { useState, useCallback } from "react";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Document } from "@/types/document";

interface DropZoneProps {
  projectId: string;
}

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

export function DropZone({ projectId }: DropZoneProps) {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      if (file.size > MAX_SIZE) {
        toast.error("Datei zu groß (max. 50MB)");
        return;
      }
      setUploading(true);
      const fd = new FormData();
      fd.append("file", file);
      try {
        await api.upload<Document>(`/api/projects/${projectId}/documents`, fd);
        qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
        toast.success(`${file.name} hochgeladen`);
      } catch {
        toast.error(`Upload fehlgeschlagen: ${file.name}`);
      } finally {
        setUploading(false);
      }
    },
    [projectId, qc]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      files.forEach(upload);
    },
    [upload]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(upload);
    e.target.value = "";
  };

  return (
    <label
      onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className="block border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-default"
      style={{
        borderColor: dragging ? "var(--accent)" : "var(--border-strong)",
        background: dragging ? "var(--accent-subtle)" : "var(--bg-surface)",
      }}
    >
      <input type="file" className="sr-only" multiple onChange={onFileInput} />
      <Upload size={24} className="mx-auto mb-3" style={{ color: dragging ? "var(--accent)" : "var(--text-muted)" }} />
      <p className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        {uploading ? "Wird hochgeladen..." : "Dateien hier hinziehen"}
      </p>
      <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        oder klicken zum Auswählen · PDF · DOCX · XLSX · TXT · und mehr
      </p>
    </label>
  );
}
```

- [ ] **Step 2: Write TextPasteModal.tsx**

```typescript
"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import type { Document } from "@/types/document";

interface TextPasteModalProps {
  projectId: string;
  onClose: () => void;
}

export function TextPasteModal({ projectId, onClose }: TextPasteModalProps) {
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    try {
      await api.post<Document>(`/api/projects/${projectId}/documents/text`, {
        title: title.trim(),
        content: content.trim(),
      });
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
      toast.success(`${title} gespeichert`);
      onClose();
    } catch {
      toast.error("Speichern fehlgeschlagen");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl overflow-hidden"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>Text einfügen</span>
          <button onClick={onClose}>
            <X size={16} style={{ color: "var(--text-muted)" }} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest font-medium" style={{ color: "var(--text-muted)" }}>Titel</label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Dokumenttitel"
              className="w-full px-3 py-2 rounded-md text-sm outline-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs uppercase tracking-widest font-medium" style={{ color: "var(--text-muted)" }}>Inhalt</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Text hier einfügen..."
              rows={10}
              className="w-full px-3 py-2 rounded-md text-sm outline-none resize-none"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-md text-sm transition-default"
              style={{ color: "var(--text-muted)" }}
            >
              Abbrechen
            </button>
            <button
              onClick={submit}
              disabled={!title.trim() || !content.trim() || loading}
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-default disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {loading ? "..." : "Speichern"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write DocumentList.tsx**

```typescript
"use client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Clock, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { usePipelineStore } from "@/store/pipelineStore";
import { formatDate, formatBytes } from "@/lib/utils";
import type { Document, DocumentStatus } from "@/types/document";

interface DocumentListProps {
  projectId: string;
}

function StatusIcon({ status }: { status: DocumentStatus }) {
  if (status === "done") return <CheckCircle2 size={14} style={{ color: "var(--success)" }} />;
  if (status === "failed") return <XCircle size={14} style={{ color: "var(--danger)" }} />;
  if (status === "processing") return <Loader2 size={14} className="animate-spin" style={{ color: "var(--accent)" }} />;
  return <Clock size={14} style={{ color: "var(--text-muted)" }} />;
}

export function DocumentList({ projectId }: DocumentListProps) {
  const qc = useQueryClient();
  const pipelines = usePipelineStore((s) => s.pipelines);

  const { data: documents, isLoading } = useQuery<Document[]>({
    queryKey: ["projects", projectId, "documents"],
    queryFn: () => api.get<Document[]>(`/api/projects/${projectId}/documents`),
    refetchInterval: 10_000,
  });

  const retryMutation = useMutation({
    mutationFn: (docId: string) =>
      api.post<Document>(`/api/projects/${projectId}/documents/${docId}/reprocess`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] }),
    onError: () => toast.error("Reprocess fehlgeschlagen"),
  });

  const deleteMutation = useMutation({
    mutationFn: (docId: string) =>
      api.delete(`/api/projects/${projectId}/documents/${docId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects", projectId, "documents"] });
      toast.success("Dokument gelöscht");
    },
    onError: () => toast.error("Löschen fehlgeschlagen"),
  });

  if (isLoading) {
    return (
      <div className="space-y-2 mt-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-10 rounded animate-pulse" style={{ background: "var(--bg-elevated)" }} />
        ))}
      </div>
    );
  }

  if (!documents?.length) {
    return (
      <p className="mt-6 text-sm" style={{ color: "var(--text-muted)" }}>
        Noch keine Dokumente hochgeladen.
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-1" aria-live="polite">
      {documents.map((doc) => {
        const liveStatus = pipelines[doc.id] ?? doc.processing_status;
        return (
          <div
            key={doc.id}
            className="flex items-center gap-3 px-3 py-2 rounded-md"
            style={{ background: "var(--bg-surface)" }}
          >
            <StatusIcon status={liveStatus} />
            <div className="flex-1 min-w-0">
              <p className="text-sm truncate" style={{ color: "var(--text-primary)" }}>
                {doc.original_filename}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {formatDate(doc.uploaded_at)} · {formatBytes(doc.file_size)}
                {liveStatus === "processing" && " · Wird verarbeitet…"}
                {liveStatus === "pending" && " · Warteschlange"}
                {liveStatus === "failed" && doc.processing_error && ` · ${doc.processing_error}`}
              </p>
            </div>
            {liveStatus === "failed" && (
              <button
                onClick={() => retryMutation.mutate(doc.id)}
                disabled={retryMutation.isPending}
                className="flex items-center gap-1 text-xs px-2 py-1 rounded transition-default"
                style={{ color: "var(--accent)" }}
              >
                <RefreshCw size={12} />
                Wiederholen
              </button>
            )}
            <button
              onClick={() => deleteMutation.mutate(doc.id)}
              disabled={deleteMutation.isPending}
              className="p-1 rounded transition-default opacity-0 hover:opacity-100 group-hover:opacity-100"
              style={{ color: "var(--text-muted)" }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Write upload/page.tsx**

```typescript
"use client";
import { use, useState } from "react";
import { DropZone } from "@/components/upload/DropZone";
import { DocumentList } from "@/components/upload/DocumentList";
import { TextPasteModal } from "@/components/upload/TextPasteModal";

export default function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [textModalOpen, setTextModalOpen] = useState(false);

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-sm font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
        Dokumente hochladen
      </h2>
      <DropZone projectId={id} />
      <button
        onClick={() => setTextModalOpen(true)}
        className="mt-3 text-sm transition-default"
        style={{ color: "var(--accent)" }}
      >
        Text direkt einfügen
      </button>
      <div className="mt-6 border-t pt-6" style={{ borderColor: "var(--border)" }}>
        <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
          Hochgeladene Dokumente
        </h3>
        <DocumentList projectId={id} />
      </div>
      {textModalOpen && (
        <TextPasteModal projectId={id} onClose={() => setTextModalOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Commit upload tab**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/components/upload/ frontend/src/app/projects/
git commit -m "feat(frontend): upload tab with drag-drop, text paste, document list with live status"
```

---

## Task 9: State tab components

**Files:**
- Create: `frontend/src/components/state/TaskCard.tsx`
- Create: `frontend/src/components/state/ContactCard.tsx`
- Create: `frontend/src/components/state/BlockerCard.tsx`
- Create: `frontend/src/components/state/DecisionCard.tsx`
- Create: `frontend/src/components/state/StateGrid.tsx`
- Create: `frontend/src/components/state/StateTimeline.tsx`
- Create: `frontend/src/app/projects/[id]/state/page.tsx`

- [ ] **Step 1: Write TaskCard.tsx**

```typescript
"use client";
import { CheckSquare, Square, AlertCircle } from "lucide-react";
import { useOptimisticTask } from "@/hooks/useOptimisticTask";
import { formatDate } from "@/lib/utils";
import type { Task } from "@/types/state";

interface TaskCardProps {
  task: Task;
  projectId: string;
}

export function TaskCard({ task, projectId }: TaskCardProps) {
  const mutation = useOptimisticTask(projectId);
  const isDone = task.status === "done";
  const isBlocked = task.status === "blocked";

  const toggle = () => {
    mutation.mutate({ taskId: task.id, status: isDone ? "open" : "done" });
  };

  const deadlineStr = task.deadline ? new Date(task.deadline) : null;
  const now = new Date();
  const daysUntil = deadlineStr ? Math.ceil((deadlineStr.getTime() - now.getTime()) / 86_400_000) : null;
  const deadlineColor =
    daysUntil === null ? "var(--text-muted)"
    : daysUntil < 0 ? "var(--danger)"
    : daysUntil < 3 ? "var(--warning)"
    : "var(--text-muted)";

  return (
    <div className="flex items-start gap-2 py-2">
      <button
        onClick={toggle}
        disabled={mutation.isPending}
        className="mt-0.5 shrink-0 transition-default disabled:opacity-50"
        aria-label={isDone ? "Als offen markieren" : "Als erledigt markieren"}
      >
        {isDone ? (
          <CheckSquare size={16} style={{ color: "var(--accent)" }} />
        ) : isBlocked ? (
          <AlertCircle size={16} style={{ color: "var(--warning)" }} />
        ) : (
          <Square size={16} style={{ color: "var(--text-muted)" }} />
        )}
      </button>
      <div className="flex-1 min-w-0">
        <p
          className="text-sm"
          style={{
            color: isDone ? "var(--text-muted)" : "var(--text-primary)",
            textDecoration: isDone ? "line-through" : "none",
          }}
        >
          {task.title}
        </p>
        {task.deadline && (
          <p className="text-xs mt-0.5" style={{ color: deadlineColor }}>
            fällig {formatDate(task.deadline)}
          </p>
        )}
        {task.source && (
          <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
            {task.source}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write ContactCard.tsx**

```typescript
import type { Contact } from "@/types/state";

interface ContactCardProps {
  contact: Contact;
}

export function ContactCard({ contact }: ContactCardProps) {
  return (
    <div className="py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{contact.name}</p>
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>{contact.role}</p>
      {contact.email && (
        <a
          href={`mailto:${contact.email}`}
          className="text-xs transition-default hover:opacity-80"
          style={{ color: "var(--accent)" }}
        >
          {contact.email}
        </a>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Write BlockerCard.tsx**

```typescript
import { AlertTriangle } from "lucide-react";
import type { Blocker } from "@/types/state";

interface BlockerCardProps {
  blocker: Blocker;
}

const severityColor = (s: string) =>
  s === "high" ? "var(--danger)" : s === "medium" ? "var(--warning)" : "var(--text-muted)";

export function BlockerCard({ blocker }: BlockerCardProps) {
  return (
    <div className="flex gap-2 py-2">
      <AlertTriangle size={14} className="mt-0.5 shrink-0" style={{ color: severityColor(blocker.severity) }} />
      <div>
        <p className="text-sm" style={{ color: "var(--text-primary)" }}>{blocker.description}</p>
        <div className="flex items-center gap-2 mt-1">
          {blocker.days_since !== undefined && (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              seit {blocker.days_since} Tagen
            </span>
          )}
          <span
            className="text-xs px-1.5 py-0.5 rounded-sm"
            style={{ background: severityColor(blocker.severity) + "20", color: severityColor(blocker.severity) }}
          >
            {blocker.severity}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Write DecisionCard.tsx**

```typescript
import { formatDate } from "@/lib/utils";
import type { Decision } from "@/types/state";

interface DecisionCardProps {
  decision: Decision;
}

export function DecisionCard({ decision }: DecisionCardProps) {
  return (
    <div className="py-2 border-b last:border-0" style={{ borderColor: "var(--border)" }}>
      <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>
        {decision.date ? formatDate(decision.date) : "—"}
      </p>
      <p className="text-sm" style={{ color: "var(--text-primary)" }}>{decision.description}</p>
    </div>
  );
}
```

- [ ] **Step 5: Write StateGrid.tsx**

```typescript
import { TaskCard } from "./TaskCard";
import { ContactCard } from "./ContactCard";
import { BlockerCard } from "./BlockerCard";
import { DecisionCard } from "./DecisionCard";
import type { StateData } from "@/types/state";

interface StateGridProps {
  state: StateData;
  projectId: string;
}

function GridSection({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
          {title}
        </span>
        <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>{count}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function StateGrid({ state, projectId }: StateGridProps) {
  const tasks = state.core?.open_tasks ?? [];
  const openTasks = tasks.filter((t) => t.status !== "done");
  const contacts = state.contacts ?? [];
  const blockers = state.blockers ?? [];
  const decisions = state.decisions ?? [];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <GridSection title="Offene Tasks" count={openTasks.length}>
        {openTasks.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine offenen Tasks</p>
        ) : (
          openTasks.map((t) => <TaskCard key={t.id} task={t} projectId={projectId} />)
        )}
      </GridSection>

      <GridSection title="Kontakte" count={contacts.length}>
        {contacts.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Kontakte</p>
        ) : (
          contacts.map((c, i) => <ContactCard key={i} contact={c} />)
        )}
      </GridSection>

      <GridSection title="Blocker" count={blockers.length}>
        {blockers.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Blocker</p>
        ) : (
          blockers.map((b, i) => <BlockerCard key={i} blocker={b} />)
        )}
      </GridSection>

      <GridSection title="Entscheidungen" count={decisions.length}>
        {decisions.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Keine Entscheidungen</p>
        ) : (
          decisions.map((d, i) => <DecisionCard key={i} decision={d} />)
        )}
      </GridSection>
    </div>
  );
}
```

- [ ] **Step 6: Write StateTimeline.tsx**

```typescript
"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import type { StateChangelog } from "@/types/state";

interface StateTimelineProps {
  projectId: string;
}

function DiffModal({ changelog, onClose }: { changelog: StateChangelog; onClose: () => void }) {
  const delta = changelog.delta as Record<string, unknown>;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border shadow-2xl max-h-[80vh] flex flex-col"
        style={{ background: "var(--bg-overlay)", borderColor: "var(--border-strong)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: "var(--border)" }}>
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Version {changelog.to_version}
          </span>
          <button onClick={onClose}><X size={16} style={{ color: "var(--text-muted)" }} /></button>
        </div>
        <div className="p-4 overflow-y-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>
            {JSON.stringify(delta, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function StateTimeline({ projectId }: StateTimelineProps) {
  const [selected, setSelected] = useState<StateChangelog | null>(null);
  const [showAll, setShowAll] = useState(false);

  const { data: history } = useQuery<StateChangelog[]>({
    queryKey: ["projects", projectId, "state", "history"],
    queryFn: () => api.get<StateChangelog[]>(`/api/projects/${projectId}/state/history?limit=20`),
  });

  const shown = showAll ? (history ?? []) : (history ?? []).slice(0, 5);

  return (
    <div className="mt-8">
      <h3 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
        Letzte Änderungen
      </h3>
      <div className="space-y-1">
        {shown.map((entry) => (
          <button
            key={entry.id}
            onClick={() => setSelected(entry)}
            className="w-full text-left flex items-center gap-3 py-2 px-3 rounded-md transition-default hover:bg-[var(--bg-surface)]"
          >
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--accent)" }} />
            <span className="text-xs flex-1" style={{ color: "var(--text-secondary)" }}>
              {entry.triggered_by}
            </span>
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              {formatDate(entry.created_at)}
            </span>
          </button>
        ))}
      </div>
      {(history?.length ?? 0) > 5 && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs transition-default"
          style={{ color: "var(--accent)" }}
        >
          Mehr anzeigen
        </button>
      )}
      {selected && <DiffModal changelog={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
```

- [ ] **Step 7: Write state/page.tsx**

```typescript
"use client";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { StateGrid } from "@/components/state/StateGrid";
import { StateTimeline } from "@/components/state/StateTimeline";
import type { ProjectState } from "@/types/state";
import Link from "next/link";

export default function StatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const { data: stateData, isLoading, isError } = useQuery<ProjectState>({
    queryKey: ["projects", id, "state"],
    queryFn: () => api.get<ProjectState>(`/api/projects/${id}/state`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="grid grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-40 rounded-lg animate-pulse" style={{ background: "var(--bg-surface)" }} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !stateData) {
    return (
      <div className="p-6">
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Lade dein erstes Dokument hoch um den Projektstatus zu befüllen.{" "}
          <Link href={`/projects/${id}/upload`} style={{ color: "var(--accent)" }}>Zu Upload</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <StateGrid state={stateData.state} projectId={id} />
      <StateTimeline projectId={id} />
    </div>
  );
}
```

- [ ] **Step 8: Commit state tab**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/components/state/ frontend/src/app/projects/
git commit -m "feat(frontend): state tab with task grid, contacts, blockers, decisions, timeline"
```

---

## Task 10: Chat tab components

**Files:**
- Create: `frontend/src/components/chat/SourcePill.tsx`
- Create: `frontend/src/components/chat/ChatMessage.tsx`
- Create: `frontend/src/components/chat/ChatInput.tsx`
- Create: `frontend/src/components/chat/ChatInterface.tsx`
- Create: `frontend/src/app/projects/[id]/chat/page.tsx`

- [ ] **Step 1: Write SourcePill.tsx**

```typescript
import { ExternalLink } from "lucide-react";

interface SourcePillProps {
  filename: string;
  onClick?: () => void;
}

export function SourcePill({ filename, onClick }: SourcePillProps) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm text-xs transition-default hover:opacity-80"
      style={{ background: "var(--bg-elevated)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
    >
      {filename}
      <ExternalLink size={10} />
    </button>
  );
}
```

- [ ] **Step 2: Write ChatMessage.tsx**

```typescript
"use client";
import ReactMarkdown from "react-markdown";
import { SourcePill } from "./SourcePill";
import type { ChatMessage as ChatMessageType } from "@/types/chat";

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export function ChatMessageComponent({ message, isStreaming }: ChatMessageProps) {
  const isUser = message.role === "user";

  const sources = message.tool_calls?.calls
    ? (message.tool_calls.calls as Array<{ name: string; arguments: string }>)
        .filter((c) => c.name === "search_documents")
        .flatMap(() => [] as string[])
    : [];

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[75%] ${isUser ? "order-1" : ""}`}>
        {isUser ? (
          <div
            className="px-4 py-2.5 rounded-lg text-sm"
            style={{ background: "var(--bg-elevated)", color: "var(--text-primary)" }}
          >
            {message.content}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-sm prose-sm" style={{ color: "var(--text-primary)" }}>
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                  code: ({ children }) => (
                    <code className="px-1 py-0.5 rounded text-xs font-mono" style={{ background: "var(--bg-elevated)" }}>
                      {children}
                    </code>
                  ),
                  ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-1">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-1">{children}</ol>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {message.content}
              </ReactMarkdown>
              {isStreaming && (
                <span className="inline-block w-0.5 h-4 ml-0.5 animate-pulse align-middle" style={{ background: "var(--accent)" }} />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write ChatInput.tsx**

```typescript
"use client";
import { useRef, useCallback } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const submit = useCallback(() => {
    const val = ref.current?.value.trim();
    if (!val || disabled) return;
    onSend(val);
    if (ref.current) ref.current.value = "";
    if (ref.current) ref.current.style.height = "auto";
  }, [onSend, disabled]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const onInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  };

  return (
    <div
      className="flex items-end gap-2 px-4 py-3 border-t"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}
    >
      <textarea
        ref={ref}
        rows={1}
        onKeyDown={onKeyDown}
        onChange={onInput}
        disabled={disabled}
        placeholder="Frage stellen..."
        className="flex-1 resize-none outline-none text-sm py-2 px-3 rounded-md"
        style={{
          background: "var(--bg-elevated)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          maxHeight: "120px",
        }}
      />
      <button
        onClick={submit}
        disabled={disabled}
        className="p-2 rounded-md transition-default disabled:opacity-40"
        style={{ background: "var(--accent)", color: "#fff" }}
        title="Senden (⌘↵)"
      >
        <Send size={14} />
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Write ChatInterface.tsx**

```typescript
"use client";
import { useState, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useChatStream } from "@/hooks/useChatStream";
import { ChatMessageComponent } from "./ChatMessage";
import { ChatInput } from "./ChatInput";
import type { ChatMessage } from "@/types/chat";

interface ChatInterfaceProps {
  projectId: string;
}

export function ChatInterface({ projectId }: ChatInterfaceProps) {
  const qc = useQueryClient();
  const { streaming, streamingText, sendMessage } = useChatStream(projectId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: history } = useQuery<ChatMessage[]>({
    queryKey: ["projects", projectId, "chat", "history"],
    queryFn: () => api.get<ChatMessage[]>(`/api/projects/${projectId}/chat/history`),
  });

  const [optimisticMessages, setOptimisticMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, streamingText, optimisticMessages]);

  const handleSend = (content: string) => {
    const tempId = crypto.randomUUID();
    const optimistic: ChatMessage = {
      id: tempId,
      project_id: projectId,
      user_id: null,
      role: "user",
      content,
      tool_calls: null,
      tool_results: null,
      state_version: null,
      created_at: new Date().toISOString(),
    };
    setOptimisticMessages((prev) => [...prev, optimistic]);

    sendMessage(content, () => {
      setOptimisticMessages([]);
      qc.invalidateQueries({ queryKey: ["projects", projectId, "chat", "history"] });
    });
  };

  const allMessages = [...(history ?? []), ...optimisticMessages];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {allMessages.length === 0 && !streaming && (
          <div className="h-full flex items-center justify-center">
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Stell eine Frage zu diesem Projekt.
            </p>
          </div>
        )}
        {allMessages.map((msg) => (
          <ChatMessageComponent key={msg.id} message={msg} />
        ))}
        {streaming && streamingText && (
          <ChatMessageComponent
            message={{
              id: "streaming",
              project_id: projectId,
              user_id: null,
              role: "assistant",
              content: streamingText,
              tool_calls: null,
              tool_results: null,
              state_version: null,
              created_at: new Date().toISOString(),
            }}
            isStreaming
          />
        )}
        <div ref={bottomRef} />
      </div>
      <ChatInput onSend={handleSend} disabled={streaming} />
    </div>
  );
}
```

- [ ] **Step 5: Write chat/page.tsx**

```typescript
"use client";
import { use } from "react";
import { ChatInterface } from "@/components/chat/ChatInterface";

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ChatInterface projectId={id} />;
}
```

- [ ] **Step 6: Commit chat tab**

```bash
cd /home/jonas/Projects/OpenPM
git add frontend/src/components/chat/ frontend/src/app/projects/
git commit -m "feat(frontend): chat tab with streaming, markdown, source pills"
```

---

## Task 11: Build verification + Docker integration

**Files:**
- Modify: `frontend/Dockerfile` (ensure build args correct)

- [ ] **Step 1: Run TypeScript check**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 2: Run build**

```bash
cd /home/jonas/Projects/OpenPM/frontend
npm run build
```

Expected: Successful build, no errors.

- [ ] **Step 3: Verify Dockerfile is correct**

Current Dockerfile in `frontend/Dockerfile` should already work. Verify it sets:
```dockerfile
FROM node:20-alpine
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
```

Next.js rewrites proxy to `API_URL` env var at runtime — this is correct.

- [ ] **Step 4: Final commit**

```bash
cd /home/jonas/Projects/OpenPM
git add .
git commit -m "feat(frontend): complete OpenPM frontend implementation"
```

---

## Notes

- The SSE events endpoint uses FastAPI's `get_project_member` dependency which reads `Authorization` header. Native `EventSource` API cannot set headers, so we use `fetch` with `ReadableStream` instead for SSE.
- The chat endpoint returns SSE but via `POST /api/projects/{id}/chat`. The response is streamed SSE. The `useChatStream` hook uses fetch to handle this.
- Next.js rewrites in `next.config.ts` proxy `/api/*` and `/auth/*` to the backend. In Docker, `API_URL` env var points to `http://backend:8000`.
- TanStack Query cache keys follow `["projects", projectId, "state"]` pattern matching the spec.
- Optimistic task updates use TanStack Query's `onMutate/onError` rollback pattern.
