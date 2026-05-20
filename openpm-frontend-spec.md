# OpenPM — Frontend Spezifikation

---

## Inhaltsverzeichnis

1. [Design-Philosophie & Ästhetik](#1-design-philosophie--ästhetik)
2. [Tech Stack](#2-tech-stack)
3. [Projektstruktur](#3-projektstruktur)
4. [Design System](#4-design-system)
5. [Layout & Navigation](#5-layout--navigation)
6. [Seiten & Views](#6-seiten--views)
7. [Komponenten-Bibliothek](#7-komponenten-bibliothek)
8. [State Management](#8-state-management)
9. [API-Integration](#9-api-integration)
10. [SSE & Realtime](#10-sse--realtime)
11. [UX-Patterns](#11-ux-patterns)
12. [Keyboard & Accessibility](#12-keyboard--accessibility)
13. [Performance](#13-performance)

---

## 1. Design-Philosophie & Ästhetik

### Richtung: Refined Utilitarian

Kein verspieltes Design, keine bunten Gradienten, keine aufmerksamkeitsheischenden Animationen. OpenPM ist ein Arbeitswerkzeug das Vertrauen ausstrahlt — ruhig, dicht, präzise. Jedes Element rechtfertigt seinen Platz.

**Referenzen:**
- **Linear** — Sidebar-Dichte, Navigation, Shortcuts
- **Vercel Dashboard** — Typografie-Hierarchie, Spacing-System
- **Raycast** — Command Palette, Keyboard-first-Feel
- **Spotlight (macOS)** — Wie sich der Chat anfühlen soll: direkt, schnell, kontextuell

### Tone

Dunkel, ruhig, professionell. Keine Spielerei. Wer OpenPM aufmacht, will arbeiten — das Interface soll sich aus dem Weg halten und gleichzeitig hochwertig anfühlen.

**Was das konkret bedeutet:**
- Animationen existieren, sind aber nie länger als 150ms
- Keine leeren "Get started" Illustrationen
- Fehler sind klar, nicht dramatisch
- Erfolg wird bestätigt, nicht gefeiert

---

## 2. Tech Stack

| Was | Womit | Begründung |
|---|---|---|
| Framework | Next.js 15 (App Router) | Self-hostable, SSR wo nötig |
| Styling | Tailwind CSS v4 | Utility-first, keine Runtime-Kosten |
| Komponenten | shadcn/ui | headless, vollständig anpassbar |
| Animationen | Framer Motion | nur für Page Transitions + Upload-Flow |
| Icons | Lucide React | konsistent, tree-shakeable |
| Globaler State | Zustand | minimal, kein Redux-Overhead |
| Server State | TanStack Query v5 | Caching, Optimistic Updates, Refetch |
| Formulare | React Hook Form + Zod | Validation ohne Overhead |
| SSE | native `EventSource` API | kein extra Package nötig |
| Chat Streaming | `ReadableStream` / `fetch` | native, kein extra Package |
| Font | **Geist** (Vercel) | passt zu Next.js, klar, nicht generisch |

---

## 3. Projektstruktur

```
frontend/
├── Dockerfile
├── next.config.ts
├── tailwind.config.ts
├── components.json                    # shadcn/ui config
├── src/
│   ├── app/
│   │   ├── layout.tsx                 # Root Layout: Font, Theme Provider
│   │   ├── page.tsx                   # Redirect → /projects
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── register/page.tsx
│   │   └── projects/
│   │       ├── page.tsx               # Projektliste (leerer State wenn keine Projekte)
│   │       └── [id]/
│   │           ├── layout.tsx         # Projekt-Shell: Sidebar + Header + SSE-Init
│   │           ├── upload/page.tsx    # Tab 1: Upload
│   │           ├── state/page.tsx     # Tab 2: State Dashboard
│   │           └── chat/page.tsx      # Tab 3: Chat
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
│   │   └── ui/                        # shadcn/ui Komponenten
│   ├── hooks/
│   │   ├── useProjectSSE.ts           # SSE-Subscription pro Projekt
│   │   ├── useOptimisticTask.ts       # Optimistic Task-Status-Update
│   │   └── useChatStream.ts           # Streaming Chat Response
│   ├── lib/
│   │   ├── api.ts                     # API-Client (fetch wrapper)
│   │   ├── queryClient.ts             # TanStack Query Setup
│   │   └── utils.ts
│   ├── store/
│   │   ├── authStore.ts               # Zustand: User + Token
│   │   └── pipelineStore.ts           # Zustand: aktive Pipeline-Events
│   └── types/
│       ├── project.ts
│       ├── document.ts
│       ├── state.ts
│       └── chat.ts
```

---

## 4. Design System

### Farbpalette (CSS Variables)

```css
:root {
  /* Backgrounds */
  --bg-base:       #0A0A0B;   /* Haupt-Hintergrund */
  --bg-surface:    #111113;   /* Cards, Sidebar */
  --bg-elevated:   #18181C;   /* Hover-States, Dropdowns */
  --bg-overlay:    #1F1F26;   /* Modals, Tooltips */

  /* Borders */
  --border:        #1F1F23;   /* Standard */
  --border-strong: #2C2C32;   /* Fokus, aktive Elemente */

  /* Text */
  --text-primary:  #EDEDEF;
  --text-secondary:#9898A6;
  --text-muted:    #6B6B7B;
  --text-disabled: #3C3C46;

  /* Accent — sparsam einsetzen */
  --accent:        #6366F1;   /* Indigo */
  --accent-hover:  #4F52D9;
  --accent-subtle: #6366F114; /* für Hintergründe */

  /* Semantisch */
  --success:       #22C55E;
  --success-subtle:#22C55E14;
  --warning:       #F59E0B;
  --warning-subtle:#F59E0B14;
  --danger:        #EF4444;
  --danger-subtle: #EF444414;

  /* Sidebar */
  --sidebar-width: 240px;
}
```

### Typografie

**Font:** Geist (über `next/font/google` oder lokal)

```
Display / Heading 1:  Geist, 20px, weight 600, tracking -0.02em
Heading 2:            Geist, 14px, weight 600, tracking -0.01em, uppercase, muted
Body:                 Geist, 14px, weight 400, line-height 1.6
Body small:           Geist, 12px, weight 400, muted
Code / Mono:          Geist Mono, 13px
Label:                Geist, 11px, weight 500, uppercase, tracking 0.08em, muted
```

### Spacing

Basis: 4px Grid. Alles ist ein Vielfaches von 4.

```
xs:  4px
sm:  8px
md:  12px
lg:  16px
xl:  24px
2xl: 32px
3xl: 48px
```

### Border Radius

```
sm:   4px   (Tags, Badges)
md:   6px   (Buttons, Inputs)
lg:   8px   (Cards)
xl:   12px  (Modals, Dropdowns)
```

### Animationen

Framer Motion nur für:
- Page Transitions (Tab-Wechsel)
- Upload-Karte erscheint in DocumentList
- Modal Open/Close

Alle anderen Transitions: CSS `transition` mit `150ms ease`.

```css
.transition-default { transition: all 150ms ease; }
.transition-slow    { transition: all 250ms ease; }  /* nur Modals */
```

---

## 5. Layout & Navigation

### Shell-Layout

```
┌──────────────────────────────────────────────────────────┐
│ Sidebar (240px, fix)  │ Main (flex-1, scrollbar)         │
│                       │                                  │
│ Logo + Name           │ ProjectHeader                    │
│ ─────────────────     │  "Müller GmbH" · active          │
│ Projects              │  [Upload] [State] [Chat]  ←Tabs  │
│  ● Müller GmbH        │ ──────────────────────────────── │
│  ○ Koch AG            │                                  │
│  ○ Testprojekt        │  Tab Content                     │
│  + Neues Projekt      │                                  │
│                       │                                  │
│ ─────────────────     │                                  │
│ User · Settings       │                                  │
└──────────────────────────────────────────────────────────┘
```

### AppSidebar

- Breite: 240px, nicht resizeable
- Projektliste: alphabetisch sortiert, aktives Projekt mit Accent-Dot
- Status-Dot pro Projekt: grün = aktiv, gelb = paused, grau = archived
- Processing-Indicator: wenn Pipeline läuft → subtiler Spinner neben Projektname
- `+ Neues Projekt` am Ende der Liste
- Footer: Avatar + Name + Settings-Icon

### ProjectHeader

```
Müller GmbH                    [active ▾]
Thomas Müller · Letztes Update: vor 2h
[Upload] [State] [Chat]
```

- Projekt-Name als H1, Client-Name als muted subtitle
- Status als Dropdown (owner kann ändern)
- Tabs als understroke — kein filled Tab-Style

### Mobile (< 768px)

- Sidebar wird zum Hamburger-Drawer
- Tabs werden zu Bottom-Navigation
- Chat-Input bleibt sticky am Bottom

---

## 6. Seiten & Views

### `/login` und `/register`

Minimalistisch. Zentriertes Formular, kein Hero, keine Marketing-Copy. Logo oben, Form mittig, dark background.

---

### `/projects`

Projektliste als Grid (3 Spalten auf Desktop, 1 auf Mobile).

**Project Card:**
```
┌──────────────────────────────┐
│ Müller GmbH                  │
│ 3 offene Tasks · 1 Blocker   │
│                              │
│ Letztes Update: vor 2h       │
│                    [active]  │
└──────────────────────────────┘
```

Empty State (keine Projekte): Kein SVG-Bild. Nur Text + Button:
```
Noch keine Projekte.
[+ Erstes Projekt anlegen]
```

---

### `/projects/[id]/upload` — Tab 1

```
┌────────────────────────────────────────────────────┐
│                                                    │
│   Dokumente hochladen                              │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │                                              │ │
│  │   Dateien hier hinziehen                     │ │
│  │   oder klicken zum Auswählen                 │ │
│  │                                              │ │
│  │   PDF · DOCX · XLSX · TXT · und mehr         │ │
│  │                                              │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│   [Text direkt einfügen]                          │
│                                                    │
│  ────────────────────────────────────────────────  │
│  Hochgeladene Dokumente                            │
│                                                    │
│  ✓ vertrag_v3.pdf         03.05. · 4 Tasks        │
│  ✓ meeting_notes.docx     01.05. · 2 Entscheidg.  │
│  ⟳ angebot_final.pdf      gerade · Verarbeitung…  │
│  ✗ scan_alt.pdf           Fehler · [Wiederholen]  │
│                                                    │
└────────────────────────────────────────────────────┘
```

**Drop Zone Verhalten:**
- Idle: Border `--border`, Background `--bg-surface`
- Drag over: Border `--accent`, Background `--accent-subtle`
- Upload läuft: Border `--border`, Progress-Indicator in der Zeile

**DocumentList Zeile — Status-Icons:**
- `done`: grünes Checkmark-Icon, muted Text mit Zusammenfassung des Deltas
- `processing`: Spinner (CSS animation, kein JS), Text "Wird verarbeitet…"
- `failed`: rotes X, Fehlertext, Retry-Button
- `pending`: grauer Punkt, "Warteschlange"

Zeilen aktualisieren sich live via SSE — kein Reload.

---

### `/projects/[id]/state` — Tab 2

**State Grid (2×2 auf Desktop, 1 Spalte auf Mobile):**

```
┌──────────────────┐  ┌──────────────────┐
│ Offene Tasks  3  │  │ Kontakte       2  │
│                  │  │                  │
│ □ AGB-Update     │  │ T. Müller        │
│   fällig 15.06.  │  │   Entscheider    │
│                  │  │   t.m@firma.de   │
│ □ Angebot v2     │  │                  │
│ □ Rückfrage §4   │  │ S. Koch          │
│                  │  │   Buchhaltung    │
└──────────────────┘  └──────────────────┘

┌──────────────────┐  ┌──────────────────┐
│ Blocker        1  │  │ Entscheidungen 4 │
│                  │  │                  │
│ ⚠ Keine          │  │ 03.05. Laufzeit  │
│  Rückmeldung     │  │  verlängert      │
│  seit 8 Tagen    │  │                  │
│  [high]          │  │ 28.04. Budget    │
│                  │  │  genehmigt       │
└──────────────────┘  └──────────────────┘
```

**Task-Checkbox:** Klick → optimistic update (Checkbox sofort gecheckt) → API call → bei Fehler revert + Toast.

**Timeline (unterhalb Grid):**
```
Letzte Änderungen

● vertrag_v3.pdf  ·  03.05. 14:32  ·  3 Tasks hinzugefügt, 1 Kontakt aktualisiert
● meeting.docx    ·  01.05. 09:15  ·  2 Entscheidungen, 1 Blocker aufgelöst
● [Mehr anzeigen]
```

Jede Timeline-Zeile ist klickbar → öffnet Diff-View (Modal) mit dem genauen State-Delta.

---

### `/projects/[id]/chat` — Tab 3

```
┌────────────────────────────────────────────────────┐
│                                                    │
│  [leer wenn kein Chat-Verlauf]                     │
│  "Stell eine Frage zu diesem Projekt."             │
│                                                    │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  Was ist aktuell zu tun?                     │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │  Es gibt 3 offene Tasks:                     │ │
│  │                                              │ │
│  │  1. AGB-Update einarbeiten — fällig 15.06.   │ │
│  │  2. Angebot v2 senden                        │ │
│  │  3. Rückfrage §4 klären (T. Müller)          │ │
│  │                                              │ │
│  │  [vertrag_v3.pdf ↗]  [meeting.docx ↗]        │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌────────────────────────────────────── [⌘↵] ──┐ │
│  │ Frage stellen...                             │ │
│  └──────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

**Chat-Nachrichten:**
- User: rechtsbündig, `--bg-elevated`, kein Avatar
- Assistant: linksbündig, kein Background, mit Source-Pills darunter
- Streaming: Text erscheint Wort für Wort, Cursor-Blink am Ende
- Source-Pills erscheinen erst wenn Antwort vollständig

**Source-Pills:**
```
[vertrag_v3.pdf ↗]
```
Klick → öffnet Document-Viewer-Modal mit Originaldokument.

---

## 7. Komponenten-Bibliothek

### DropZone

```
Props:
  projectId: string
  onUploadComplete: (documentId: string) => void

Verhalten:
  - onDragEnter/Leave/Drop für visuelle States
  - FileReader für Preview (Name + Größe)
  - Max-Size Check client-side vor Upload (MAX_UPLOAD_BYTES aus Config)
  - POST multipart/form-data an /api/projects/{id}/documents
  - Bei Erfolg: Document erscheint sofort in DocumentList (optimistic)
```

### DocumentList

```
Props:
  projectId: string
  documents: Document[]

Verhalten:
  - Live-Updates via useProjectSSE Hook
  - Neue Dokumente animiert einblenden (Framer Motion: y: -8 → 0, opacity 0 → 1)
  - Status wechselt live ohne Reload
```

### TaskCard

```
Props:
  task: Task
  projectId: string

Verhalten:
  - Checkbox: useOptimisticTask Hook
  - Deadline: rot wenn überfällig, gelb wenn < 3 Tage
  - Source-Referenz als muted Footnote
```

### ChatInput

```
Props:
  projectId: string
  onSend: (message: string) => void
  disabled: boolean

Verhalten:
  - Textarea, auto-resize bis max 5 Zeilen
  - Enter = senden, Shift+Enter = neue Zeile
  - Cmd+Enter = senden (auch auf Mac)
  - Disabled während Stream läuft
```

### ChatMessage

```
Props:
  message: ChatMessage
  isStreaming?: boolean

Verhalten:
  - Markdown rendering (react-markdown, minimaler Subset)
  - Source Pills nur bei role='assistant' und wenn sources vorhanden
  - Streaming: Text update per character/word via ReadableStream
```

### CommandPalette

```
Trigger: Cmd+K (global)

Aktionen:
  - Projekt wechseln (fuzzy search über Projektnamen)
  - Neues Projekt anlegen
  - Zu Upload / State / Chat navigieren
  - Letzte Dokumente öffnen

Implementierung: shadcn/ui cmdk
```

### DiffModal

```
Trigger: Klick auf Timeline-Eintrag

Inhalt:
  - State-Delta als strukturierte Diff-Ansicht
  - Grün: hinzugefügt, Rot: entfernt, Gelb: geändert
  - Quelle: welches Dokument hat diesen Change ausgelöst
```

---

## 8. State Management

### Zustand Stores

**authStore:**
```typescript
{
  user: User | null
  token: string | null
  setAuth: (user, token) => void
  clearAuth: () => void
}
```

**pipelineStore:**
```typescript
{
  // documentId → aktueller Pipeline-Status
  pipelines: Record<string, PipelineStatus>
  setPipelineStatus: (documentId, status) => void
  clearPipeline: (documentId) => void
}
```

### TanStack Query Keys

```typescript
// Konventionelle Query Keys für Cache-Invalidierung
['projects']
['projects', projectId]
['projects', projectId, 'documents']
['projects', projectId, 'state']
['projects', projectId, 'state', 'history']
['projects', projectId, 'chat', 'history']
```

Nach `pipeline_complete` SSE-Event → `invalidateQueries(['projects', projectId, 'state'])` → State-Tab updated automatisch.

---

## 9. API-Integration

### API-Client (`lib/api.ts`)

Zentraler fetch-Wrapper. Liest Token aus `authStore`, setzt `Authorization` Header automatisch. Wirft typisierte Errors.

```typescript
interface ApiError {
  status: number
  message: string
  detail?: string
}

api.get<T>(path): Promise<T>
api.post<T>(path, body): Promise<T>
api.patch<T>(path, body): Promise<T>
api.delete(path): Promise<void>
api.upload(path, formData): Promise<T>    // für Dokument-Upload
api.stream(path, body, onChunk): Promise<void>   // für Chat-Stream
```

### Fehlerbehandlung

- 401 → Token löschen, Redirect zu `/login`
- 403 → Toast "Keine Berechtigung"
- 413 → Toast "Datei zu groß (max. 50MB)"
- 5xx → Toast "Serverfehler, bitte erneut versuchen"
- Network Error → Toast "Keine Verbindung"

---

## 10. SSE & Realtime

### useProjectSSE Hook

```typescript
// Wird im [id]/layout.tsx gemountet — aktiv solange Projekt offen ist
useProjectSSE(projectId: string)

Intern:
  const es = new EventSource(`/api/projects/${projectId}/events`, {
    headers: { Authorization: `Bearer ${token}` }
  })

  es.onmessage = (event) => {
    const data = JSON.parse(event.data)

    switch (data.event) {
      case 'pipeline_started':
        pipelineStore.setPipelineStatus(data.document_id, 'processing')
        break
      case 'pipeline_complete':
        pipelineStore.setPipelineStatus(data.document_id, 'done')
        queryClient.invalidateQueries(['projects', projectId, 'state'])
        queryClient.invalidateQueries(['projects', projectId, 'documents'])
        break
      case 'pipeline_failed':
        pipelineStore.setPipelineStatus(data.document_id, 'failed')
        toast.error(`Verarbeitung fehlgeschlagen: ${data.error}`)
        break
    }
  }

  // Cleanup bei Unmount
  return () => es.close()
```

### useChatStream Hook

```typescript
useChatStream(projectId: string)

Intern:
  const response = await fetch(`/api/projects/${projectId}/chat`, {
    method: 'POST',
    body: JSON.stringify({ message }),
    headers: { Authorization: `Bearer ${token}` }
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    onChunk(decoder.decode(value))
  }
```

---

## 11. UX-Patterns

### Optimistic Updates

Überall wo der User eine Aktion ausführt die schnell sein sollte:

| Aktion | Optimistic | Rollback bei Fehler |
|---|---|---|
| Task als erledigt markieren | Checkbox sofort gecheckt | Uncheck + Toast |
| Dokument hochladen | Zeile sofort in Liste mit `pending` | Zeile rot + Fehler |
| Projekt-Status ändern | Badge sofort aktualisiert | Revert + Toast |

### Toast Notifications

Minimalistisch — kleine Leiste unten rechts, max 3 gleichzeitig, auto-dismiss nach 4s.

```
✓  Dokument hochgeladen
✗  Verarbeitung fehlgeschlagen — Datei beschädigt
ℹ  Task als erledigt markiert
```

Implementierung: `sonner` (lightweight Toast Library, shadcn/ui-kompatibel).

### Loading States

- Kein Full-Page-Spinner. Immer skeleton oder inline-Spinner.
- Skeleton: gleiche Struktur wie Content, `--bg-elevated` mit Pulse-Animation
- Inline-Spinner: 16px, nur in Buttons und Zeilen

### Empty States

Kein leerer Bildschirm, kein SVG. Immer Text + Action:

| Situation | Text | Action |
|---|---|---|
| Keine Projekte | "Noch keine Projekte." | `+ Projekt anlegen` |
| Keine Dokumente | "Noch keine Dokumente hochgeladen." | Drop Zone ist bereits sichtbar |
| Leerer Chat | "Stell eine Frage zu diesem Projekt." | Kein Button — Input ist da |
| Kein State | "Lade dein erstes Dokument hoch um den Projektstatus zu befüllen." | Link zu Upload-Tab |

---

## 12. Keyboard & Accessibility

### Shortcuts

| Shortcut | Aktion |
|---|---|
| `Cmd+K` | Command Palette öffnen |
| `Cmd+1` | Upload-Tab |
| `Cmd+2` | State-Tab |
| `Cmd+3` | Chat-Tab |
| `Cmd+Enter` | Chat senden |
| `Shift+Enter` | Neue Zeile im Chat-Input |
| `Esc` | Modal schließen / Command Palette schließen |

Shortcuts werden in `layout.tsx` global via `useEffect` + `keydown` registriert.

### Accessibility

- Alle interaktiven Elemente: `focus-visible` Ring in `--accent`
- Formulare: `label` mit `htmlFor`, kein placeholder-only
- Icons: `aria-label` oder begleitender Text
- SSE-Updates: `aria-live="polite"` auf DocumentList für Screen Reader
- Farbkontrast: alle Text/Hintergrund-Kombinationen ≥ 4.5:1 (WCAG AA)

---

## 13. Performance

### Strategie

- **Server Components** für alle statischen Seiten (Projektliste, State-View initial)
- **Client Components** nur wo nötig: DropZone, Chat, SSE-abhängige Komponenten
- **Streaming SSR** für schnelle First Paint
- **TanStack Query** übernimmt Caching — kein redundanter Fetch

### Bundle

- Icons: nur verwendete Lucide-Icons importieren (tree-shaking)
- Framer Motion: lazy import (`await import('framer-motion')`) nur wo gebraucht
- shadcn/ui: nur installierte Komponenten im Bundle

### Bilder

- Keine Bilder im UI außer User-Avatar (optional, v2)
- Dokumenten-Thumbnails: nicht für MVP

---

*Version 1.0 | Mai 2026*
