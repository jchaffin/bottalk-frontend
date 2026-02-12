# Outrival Frontend

A real-time voice demo where two AI agents — **Sarah** (sales rep) and **Mike** (skeptical buyer) — have a live sales conversation you can listen to and follow along with a streaming transcript.

## Tech Stack

- **Next.js 16** with App Router and TypeScript
- **React 19**
- **Tailwind CSS v4**
- **Daily.co** (`@daily-co/daily-js`) for WebRTC audio rooms
- **Pipecat Cloud** for running AI agent pipelines (GPT-4o + ElevenLabs TTS)

## How It Works

1. The user clicks **Start Conversation** on the home page.
2. The Next.js API route (`/api/start`) creates a Daily room, generates tokens, and starts two Pipecat Cloud agent sessions (Sarah and Mike).
3. The browser joins the Daily room and receives audio from both agents in real time.
4. Transcript lines stream in via Daily `app-message` events and render in a scrollable panel alongside speaker avatars.
5. Clicking **Stop Conversation** tears down the call and stops both agent sessions via `/api/stop`.

## Project Structure

```
src/
├── app/
│   ├── page.tsx          # Home page with start/stop controls
│   ├── layout.tsx        # Root layout
│   └── api/
│       ├── start/        # POST — creates room, tokens, starts agents
│       └── stop/         # POST — stops agent sessions
└── components/
    ├── CallProvider.tsx   # Joins Daily room, manages audio & transcript state
    ├── AgentAvatar.tsx    # Speaker avatar with active-speaking indicator
    └── Transcript.tsx     # Scrollable, color-coded conversation transcript
```

## Getting Started

### Prerequisites

- Node.js 18+
- A [Daily.co](https://www.daily.co/) API key
- A [Pipecat Cloud](https://www.pipecat.ai/) API key

### Environment Variables

Create a `.env.local` file in this directory:

```env
DAILY_API_KEY=your_daily_api_key
PIPECAT_CLOUD_API_KEY=your_pipecat_cloud_api_key
```

Optional variables:

| Variable | Default | Description |
|---|---|---|
| `PCC_AGENT_NAME` | `outrival-agent` | Pipecat Cloud agent name |
| `CONVERSATION_TOPIC` | `enterprise software sales` | Topic for the agent prompts |
| `SARAH_VOICE_ID` | `21m00Tcm4TlvDq8ikWAM` | ElevenLabs voice ID for Sarah |
| `MIKE_VOICE_ID` | `TxGEqnHWrfWFTfGW9XjX` | ElevenLabs voice ID for Mike |

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to start a conversation.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Create a production build |
| `npm run start` | Run the production server |
| `npm run lint` | Run ESLint |

## Deployment

The frontend can be deployed to [Vercel](https://vercel.com) or any platform that supports Next.js. Make sure to set the required environment variables in your deployment settings.

> **Note:** The AI agents run on Pipecat Cloud, not on the frontend server. See the `agents/` directory at the project root for agent deployment configuration.
