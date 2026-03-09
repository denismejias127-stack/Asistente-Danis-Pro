# AI Chat Application

## Overview

This is a full-stack AI chat application built with React on the frontend and Express.js on the backend. It provides a ChatGPT-like interface with a sidebar showing conversation history, real-time streaming AI responses via Server-Sent Events (SSE), and voice chat capabilities. Users can create conversations, send text messages, and use voice input/output. The AI responses are powered by OpenAI's API via Replit AI Integrations.

Key features:
- Multi-conversation management with persistent history
- Streaming text responses (SSE)
- Voice chat (record audio, stream transcription + TTS response)
- Markdown rendering with syntax highlighting in AI responses
- Responsive sidebar layout

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

- **Framework**: React 18 with TypeScript, built using Vite
- **Routing**: Wouter (lightweight client-side router). Routes: `/` (new chat), `/c/:id` (existing conversation)
- **State Management**: TanStack Query (React Query v5) for server state, local `useState` for UI state
- **UI Components**: shadcn/ui (New York style) built on Radix UI primitives
- **Styling**: Tailwind CSS with CSS variables for theming. Supports dark mode via `.dark` class
- **Fonts**: Inter (sans-serif) and JetBrains Mono (monospace) from Google Fonts
- **Animations**: Framer Motion for message entry animations
- **Markdown**: react-markdown + remark-gfm + react-syntax-highlighter for rich message rendering

**Component structure:**
- `App.tsx` — Root, wraps with QueryClientProvider, SidebarProvider, TooltipProvider
- `pages/chat-page.tsx` — Main chat view, assembles messages list + input
- `components/app-sidebar.tsx` — Conversation list, new chat button, delete action
- `components/chat/message-bubble.tsx` — Individual message with avatar
- `components/chat/chat-input.tsx` — Textarea with send + voice record buttons
- `components/chat/markdown-renderer.tsx` — Renders AI markdown with code copy

**Key hooks:**
- `use-conversations.ts` — CRUD for conversations via React Query
- `use-chat.ts` — Handles SSE streaming, optimistic UI, conversation creation
- `use-mobile.tsx` — Responsive breakpoint detection

### Backend Architecture

- **Framework**: Express.js with TypeScript, running via `tsx` in dev
- **Entry point**: `server/index.ts` creates HTTP server and registers routes
- **Routes**: `server/routes.ts` registers all API endpoints
- **Storage layer**: `server/storage.ts` — `DatabaseStorage` class implementing `IStorage` interface, all DB calls go through this
- **Build**: esbuild bundles server to `dist/index.cjs`, Vite builds client to `dist/public`
- **Dev server**: Vite runs in middleware mode inside Express (HMR enabled)

**API Endpoints:**
- `GET /api/conversations` — list all conversations
- `POST /api/conversations` — create new conversation
- `GET /api/conversations/:id` — get conversation with messages
- `DELETE /api/conversations/:id` — delete conversation and its messages
- `POST /api/conversations/:id/messages` — send a message, returns SSE stream with AI response
- `POST /api/conversations/:id/voice-messages` — send audio blob, returns SSE stream with transcript + TTS audio

**SSE Streaming pattern:**
The message creation endpoint saves the user message, then opens an OpenAI streaming completion and pipes chunks back to the client as SSE events. The client (`use-chat.ts`) reads the stream, accumulates content, and shows optimistic UI during generation. On completion, React Query cache is invalidated to reload from DB.

### Replit Integrations

The project has a `server/replit_integrations/` and `client/replit_integrations/` folder structure providing reusable modules:

- **`chat/`** — Storage + routes for conversation/message management
- **`audio/`** — Voice recording (MediaRecorder), PCM16 playback via AudioWorklet, speech-to-text, TTS streaming. Uses a ring buffer for smooth audio playback
- **`image/`** — Image generation via `gpt-image-1` model
- **`batch/`** — Batch processing with concurrency limiting (p-limit) and retry logic (p-retry) for rate-limited APIs

### Data Storage

- **Database**: PostgreSQL via `pg` driver
- **ORM**: Drizzle ORM with `drizzle-zod` for schema validation
- **Schema** (`shared/schema.ts`):
  - `conversations` table: `id`, `title`, `created_at`
  - `messages` table: `id`, `conversation_id` (FK → conversations, cascade delete), `role` (user/assistant), `content`, `created_at`
- **Migrations**: Drizzle Kit, config in `drizzle.config.ts`, output to `./migrations/`
- **Connection**: `DATABASE_URL` environment variable required

### Shared Code

`shared/` folder is accessible from both client and server via `@shared/*` alias:
- `schema.ts` — Drizzle table definitions + Zod insert schemas + TypeScript types
- `routes.ts` — Typed API route definitions (method, path, input/response Zod schemas). Used by both client hooks and server route handlers to ensure consistency

### Authentication

No authentication system is currently implemented. Sessions/auth can be added — `connect-pg-simple` is listed as a dependency suggesting session-based auth was considered.

## External Dependencies

### AI / LLM
- **OpenAI API** via Replit AI Integrations proxy
  - Environment variables: `AI_INTEGRATIONS_OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
  - Used for: chat completions (streaming), speech-to-text (Whisper), text-to-speech, image generation (`gpt-image-1`)
  - Client initialized in `server/routes.ts` and `server/replit_integrations/*/client.ts`

### Database
- **PostgreSQL** — requires `DATABASE_URL` environment variable
- Provisioned separately (Replit Postgres or external)

### Key NPM Packages

| Package | Purpose |
|---|---|
| `drizzle-orm` + `drizzle-zod` | ORM + schema validation |
| `openai` | OpenAI API client |
| `@tanstack/react-query` | Server state management |
| `wouter` | Client routing |
| `framer-motion` | Animations |
| `react-markdown` + `remark-gfm` | Markdown rendering |
| `react-syntax-highlighter` | Code block highlighting |
| `p-limit` + `p-retry` | Batch processing concurrency/retries |
| `date-fns` | Date formatting in sidebar |
| `lucide-react` | Icons |
| `zod` | Schema validation |

### Replit-specific Plugins (dev only)
- `@replit/vite-plugin-runtime-error-modal` — Error overlay
- `@replit/vite-plugin-cartographer` — File map
- `@replit/vite-plugin-dev-banner` — Dev banner