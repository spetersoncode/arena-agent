# Arena Agent

A reference project demonstrating a modern TypeScript full-stack monorepo. An AI-powered D&D 5e combat arena simulator where you describe a scenario in chat and an AI agent handles stat blocks, initiative, dice rolls, and combat narration.

**Purpose:** Evaluate the feasibility of this stack and document the integration patterns. Not a production app — a working demo with real auth, real AI, and real type safety.

## Stack

| Layer | Tech | Notes |
|-------|------|-------|
| Monorepo | pnpm workspaces | Flat `frontend/` + `backend/` layout |
| Backend | Hono | Lightweight, fast, perfect for RPC type export |
| Database | Turso / libSQL + Drizzle ORM | SQLite in dev, Turso in prod |
| Auth | Better Auth + Google OAuth | Session-based, RBAC built-in |
| AI Agent | Mastra + Vertex AI (Gemini 3.0 Pro/Flash) | Tool-calling agent with D&D tools |
| Frontend | Vite 7 + React 19 | |
| Styling | Tailwind CSS v4 + shadcn/ui + Lucide | |
| Type-safe API | Hono RPC (`hono/client`) | Zero codegen, compile-time only |
| Linting | Biome 2.x | Replaces ESLint + Prettier |
| Testing | Vitest | Both frontend (jsdom) and backend (node) |

## Project Structure

```
arena-agent/
├── backend/
│   ├── src/
│   │   ├── agent/          # Mastra AI agent + D&D combat tools
│   │   ├── db/             # Drizzle schema + connection
│   │   ├── routes/         # Hono route handlers (auth, arena, admin)
│   │   ├── schemas/        # Zod schemas (single source of truth)
│   │   ├── app.ts          # Hono app — exports AppType for RPC
│   │   ├── auth.ts         # Better Auth config
│   │   ├── env.ts          # Env validation
│   │   ├── index.ts        # Server entry point
│   │   └── middleware.ts   # Auth + RBAC middleware
│   ├── drizzle.config.ts
│   └── vitest.config.ts
├── frontend/
│   ├── src/
│   │   ├── components/     # Layout + shadcn/ui components
│   │   ├── lib/            # API client, auth client, query client
│   │   ├── pages/          # Login, Home, Arena (chat), Admin
│   │   └── test/           # Vitest setup
│   ├── vite.config.ts
│   └── vitest.config.ts
├── biome.json              # Shared lint/format config
├── tsconfig.json           # Shared TS base config
├── pnpm-workspace.yaml
└── package.json
```

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Google Cloud project** with:
  - OAuth 2.0 credentials (for auth)
  - Vertex AI API enabled (for Gemini)
  - `gcloud` CLI authenticated

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Google OAuth credentials

1. Go to [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click **Create Credentials → OAuth client ID**
3. Application type: **Web application**
4. Authorized JavaScript origins: `http://localhost:5173`
5. Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google`
6. Copy the Client ID and Client Secret

### 3. Vertex AI

```bash
# Enable the API in your GCP project
gcloud services enable aiplatform.googleapis.com

# Authenticate for local dev (Application Default Credentials)
gcloud auth application-default login
```

### 4. Environment variables

```bash
cp backend/.env.example backend/.env
```

Fill in `backend/.env`:

```env
DATABASE_URL=file:local.db
BETTER_AUTH_SECRET=generate-a-random-string-here
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_VERTEX_PROJECT=your-gcp-project-id
GOOGLE_VERTEX_LOCATION=us-central1
PORT=3000
FRONTEND_URL=http://localhost:5173
```

Generate `BETTER_AUTH_SECRET`:
```bash
openssl rand -base64 32
```

### 5. Database

```bash
pnpm db:generate   # Generate Drizzle migration files
pnpm db:migrate    # Apply migrations to local SQLite
```

### 6. Run

```bash
pnpm dev           # Starts both frontend (:5173) and backend (:3000)
pnpm dev:backend   # Backend only
pnpm dev:frontend  # Frontend only
```

### 7. First user → Admin

The first user to sign in gets the `player` role by default. To make yourself admin, use the SQLite CLI:

```bash
cd backend
sqlite3 local.db "UPDATE users SET role = 'admin' WHERE email = 'your@email.com';"
```

After that, you can promote other users from the Admin panel in the UI.

## Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start frontend + backend in parallel |
| `pnpm test` | Run all tests |
| `pnpm check` | Biome lint + format check |
| `pnpm check:fix` | Biome auto-fix |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply migrations |

## RBAC Model

Three roles in a simple hierarchy:

| Role | Can do |
|------|--------|
| **spectator** | View arenas and chat history (read-only) |
| **player** | Everything spectator can + create arenas, send chat messages |
| **admin** | Everything player can + manage users, change roles, delete arenas, view all arenas |

The middleware enforces this as a hierarchy — admin ≥ player ≥ spectator — so a single `requireRole("player")` check lets both players and admins through.

## How the Type-Safe API Works

This is the most interesting architectural pattern in the project. There is **no REST client, no codegen, no shared package, and no duplicated types.** The backend defines routes, and the frontend gets full type safety from them at compile time.

### Backend: export the type

```ts
// backend/src/app.ts
const app = new Hono()
  .get("/api/arenas", requireAuth, async (c) => {
    const arenas = await db.select().from(schema.arenas);
    return c.json({ success: true, data: arenas });
  })
  .post("/api/arenas", requireAuth, zValidator("json", createArenaRequestSchema), async (c) => {
    // ...
    return c.json({ success: true, data: { arenaId } });
  });

export type AppType = typeof app;  // ← this is the entire API contract
```

Hono infers a type from the chained route definitions that encodes every route path, HTTP method, request params, and response shape.

### Frontend: import the type

```ts
// frontend/src/lib/api.ts
import type { AppType } from "@arena/backend/app";  // ← type-only import, erased at compile time
import { hc } from "hono/client";

export const api = hc<AppType>("/");
```

`import type` is completely erased by TypeScript before the bundler ever sees it. **Zero backend code enters the frontend bundle.** The `hc()` function is a tiny (~1KB) Proxy-based fetch wrapper.

### Usage: fully typed

```ts
const res = await api.api.arenas.$get();          // TypeScript knows: GET /api/arenas
const data = await res.json();                     // TypeScript knows the exact response shape
//    ^? { success: true, data: Arena[] } | { success: false, error: string }

const res2 = await api.api.arenas.$post({
  json: { message: "3 goblins vs a paladin" },     // TypeScript enforces the request body shape
});
```

### Making it work in a monorepo

Three pieces of config are required:

**1. TypeScript path alias** (`frontend/tsconfig.app.json`):
```json
{
  "compilerOptions": {
    "paths": {
      "@arena/backend/*": ["../backend/src/*"]
    }
  }
}
```

**2. Vite resolve alias** (`frontend/vite.config.ts`):
```ts
resolve: {
  alias: {
    "@arena/backend": resolve(__dirname, "../backend/src"),
  },
},
```

**3. Vite dev proxy** (`frontend/vite.config.ts`):
```ts
server: {
  proxy: {
    "/api": { target: "http://localhost:3000", changeOrigin: true },
  },
},
```

The TS path alias lets the compiler resolve the type. The Vite alias is needed so the dev server doesn't choke on the import (even though it's type-only, Vite still resolves it). The proxy routes API calls to the backend during development.

### Why not tRPC?

tRPC solves the same problem but adds its own router abstraction on top. With Hono, the RPC capability is built into the framework — you just export the type from your existing routes. No additional library, no wrapper functions, no separate router definition. The routes are plain Hono routes that also work as a normal REST API.

## How the AI Agent Works

Mastra provides the agent framework. The arena master is a Gemini 3.0 Pro agent with four tools:

| Tool | Purpose |
|------|---------|
| `roll-dice` | Roll any D&D dice notation (e.g. `2d6+3`) with true randomness |
| `ability-modifier` | Calculate modifier from ability score |
| `generate-stat-block` | Create a full creature stat block scaled by challenge rating |
| `resolve-attack` | Complete attack resolution: d20 roll → hit/miss → damage, with crit/fumble |

The agent's system prompt instructs it to always use these tools for any randomness — never fabricate numbers. This ensures every dice roll is mechanically correct and auditable.

```ts
// backend/src/agent/index.ts
export const arenaMasterAgent = new Agent({
  id: "arena-master",
  model: vertex("gemini-3.0-pro-preview"),
  tools: { rollDice, abilityModifier, generateStatBlock, resolveAttack },
  instructions: "You are the Arena Master, a D&D 5e combat encounter manager...",
});
```

A lighter `gemini-3.0-flash-preview` agent is also defined for quick helper tasks.

## Lessons Learned & Gotchas

### Hono RPC requires chained routes

The type inference only works when routes are **chained** on a single Hono instance:

```ts
// ✅ Type information preserved
const app = new Hono()
  .get("/a", ...)
  .post("/b", ...);

// ✅ .route() also works in recent Hono versions
const app = new Hono()
  .route("/api/arenas", arenaRoutes)
  .route("/api/admin", adminRoutes);
```

If you create separate `app.get()` calls (not chained), TypeScript can't infer the combined type.

### Biome 2.x breaking changes

Biome 2.x (released 2025) renamed several config keys:
- `organizeImports` → `assist.actions.source.organizeImports`
- `files.ignore` → `files.includes` (inverted logic)
- Schema URL must match your CLI version exactly

If you see config errors, run `npx @biomejs/biome migrate`.

### Better Auth + Drizzle schema alignment

Better Auth expects specific table/column names. The Drizzle schema must match exactly. Map them explicitly in the adapter config:

```ts
drizzleAdapter(db, {
  provider: "sqlite",
  schema: {
    user: schema.users,
    session: schema.sessions,
    account: schema.accounts,
    verification: schema.verifications,
  },
});
```

If you add custom fields to the user table (like `role`), declare them in Better Auth's `user.additionalFields` config.

### Zod v4 vs v3

As of early 2026:
- **Better Auth** requires zod v4
- **Mastra** accepts both (`^3.25.0 || ^4.0.0`)
- **AI SDK** (transitive via Mastra) has some internal deps that pin zod v3

Install zod v4 and let the package manager resolve the transitive v3 needs. The peer dependency warnings from `@ai-sdk/ui-utils` are harmless — they're Mastra's internal concern.

### Mastra tool execute signature

Mastra tools receive input directly, not wrapped in `{ context }`:

```ts
// ✅ Correct
createTool({
  inputSchema: z.object({ notation: z.string() }),
  execute: async (input) => {
    const { notation } = input;  // direct access
  },
});

// ❌ Wrong — older pattern
execute: async ({ context }) => { ... }
```

### Vertex AI authentication

Vertex AI uses Application Default Credentials (ADC). For local dev:

```bash
gcloud auth application-default login
```

Set `GOOGLE_VERTEX_PROJECT` and `GOOGLE_VERTEX_LOCATION` in your env. No API key needed.

### Frontend tsconfig: `types: []`

When including backend source via path alias, the frontend's tsconfig will try to resolve `@types/node` from the backend's transitive dependencies. Set `"types": []` in the frontend's `tsconfig.app.json` to prevent this — the frontend should only use DOM types, not Node types. Keep `"types": ["node"]` in `tsconfig.node.json` (for vite.config.ts).

### Vite proxy is essential for dev

The Hono RPC client initializes with `hc<AppType>("/")` — relative URLs. In development, the frontend runs on `:5173` and the backend on `:3000`. Without the Vite proxy, every API call would go to the wrong port. The proxy config in `vite.config.ts` transparently forwards `/api/*` to the backend.

### Don't over-abstract shared code

We initially created a `packages/shared` workspace package for Zod schemas and types. We deleted it. With Hono RPC, the frontend gets all types from the backend's route definitions at compile time. A shared package adds a maintenance layer with no benefit when the backend is already the single source of truth.

If you genuinely have code that runs on both sides at runtime (not just types), a shared package makes sense. For type sharing alone, Hono RPC eliminates the need.

## Testing Strategy

- **Backend tools**: Pure function exports (`parseDiceNotation`, `calculateAbilityModifier`) tested directly, plus Mastra tool `.execute()` calls
- **Backend middleware**: Hono's built-in `app.request()` for testing route-level behavior without a running server
- **Backend schemas**: Zod `.safeParse()` for validation boundary testing
- **Frontend components**: React Testing Library + jsdom for render tests

The tools are designed with a testable pure-function core. The Mastra `execute` wrapper adds schema validation, but the logic lives in functions that can be tested without the Mastra runtime.
