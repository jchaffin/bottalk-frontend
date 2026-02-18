# OutRival Frontend

Next.js app that lets you watch two AI voice agents have a live conversation. Pick a scenario, customize the prompts, or describe any topic and let the system generate the roles.

## Quick Start

```bash
npm install
npm run db:push    # push schema to Prisma Postgres
npm run db:seed    # seed built-in scenarios
npm run dev        # http://localhost:3000
```

## Environment Variables

Create `.env.local`:

```env
# Required
DAILY_API_KEY=
OPENAI_API_KEY=
PIPECAT_CLOUD_PUBLIC_API_KEY=
PRISMA_DATABASE_URL=prisma+postgres://...   # Accelerate proxy
POSTGRES_URL=postgres://...                  # Direct TCP (migrations)

# Optional
PCC_AGENT_NAME=outrival-agent
NEXT_PUBLIC_API_URL=http://localhost:8000    # set for local agent dev
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build (generates Prisma client first) |
| `npm run db:push` | Push schema to Postgres |
| `npm run db:seed` | Seed built-in scenarios |
| `npm run db:studio` | Browse data in Prisma Studio |

## Key Files

```
prisma/
  schema.prisma        Scenario + Session models
  seed.ts              Seeds sales, support, discovery scenarios
prisma.config.ts       Prisma 7 CLI config (reads POSTGRES_URL)

src/
  app/
    page.tsx            Scenario picker → prompt editor → live call
    api/
      scenarios/        GET — list scenarios from DB
      start/            POST — create room, start agents, persist session
      stop/             POST — stop agents, delete session
      generate/        POST — OpenAI generates role prompts from a topic
  components/
    CallProvider.tsx     Daily room audio + transcript via app-messages
    AgentAvatar.tsx      Speaker bubble with speaking indicator
    Transcript.tsx       Color-coded scrolling transcript
    ThemeToggle.tsx      Dark/light mode
  lib/
    prisma.ts            Prisma client singleton (Accelerate)
    api.ts               Client-side API helpers + types
```
