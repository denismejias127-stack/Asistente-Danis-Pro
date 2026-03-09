# AI Assistant — Full Stack App

## Overview
A full-stack AI assistant app with chat (any language), voice messages, image generation, and video generation (paid, $10 one-time via Stripe).

## Stack
- **Frontend**: React + Vite + TypeScript + Tailwind + Shadcn UI + Wouter
- **Backend**: Express + TypeScript (tsx)
- **Database**: PostgreSQL via Drizzle ORM
- **Auth**: Replit OIDC (Login with Replit)
- **AI**: OpenAI via Replit AI Integrations (no user API key needed)
  - Chat: gpt-5.2 (streaming SSE)
  - Voice: gpt-4o-mini-transcribe (STT) + gpt-audio (speech-to-speech)
  - Images: gpt-image-1 (base64 response)
- **Payments**: Stripe ($10 one-time for video generation Pro access)

## Key Files
- `shared/schema.ts` — DB schema (users, sessions, conversations, messages)
- `server/index.ts` — Express app entry, sets up auth before routes
- `server/routes.ts` — All API routes (auth, conversations, chat SSE, image gen, Stripe)
- `server/storage.ts` — Database CRUD operations
- `server/replit_integrations/auth/replitAuth.ts` — Replit OIDC setup
- `server/replit_integrations/audio/routes.ts` — Voice message endpoint
- `client/src/App.tsx` — Auth guard (shows login page if not authenticated)
- `client/src/pages/login.tsx` — Login page
- `client/src/pages/chat-page.tsx` — Chat UI with image/video mode
- `client/src/components/app-sidebar.tsx` — Sidebar with user info + logout
- `client/src/components/chat/chat-input.tsx` — Input with mode switcher (chat/image/video)
- `client/src/hooks/use-auth.ts` — Auth state hook

## Features
1. **Authentication** — Login with Replit account, sessions stored in DB
2. **Chat** — Streaming AI chat in any language (auto-detects user's language)
3. **Voice** — Record audio → transcribed → AI voice response
4. **Image Generation** — Switch to Image mode, describe what you want, AI generates it
5. **Video Generation** — Requires $10 Pro subscription via Stripe (paywall modal)

## Environment Variables Needed
- `SESSION_SECRET` — Set automatically
- `AI_INTEGRATIONS_OPENAI_API_KEY` — Provided by Replit AI Integrations
- `AI_INTEGRATIONS_OPENAI_BASE_URL` — Provided by Replit AI Integrations
- `DATABASE_URL` — Provided by Replit PostgreSQL
- `STRIPE_SECRET_KEY` — Must be provided by user to enable payments
- `STRIPE_WEBHOOK_SECRET` — Optional, for webhook signature verification

## Routes
- `GET /api/auth/user` — Current user info
- `GET /api/login` — Start Replit OIDC login
- `GET /api/logout` — Log out + redirect
- `GET /api/conversations` — List user conversations
- `POST /api/conversations` — Create new conversation
- `GET /api/conversations/:id` — Get conversation with messages
- `DELETE /api/conversations/:id` — Delete conversation
- `POST /api/conversations/:id/messages` — Send chat message (SSE stream)
- `POST /api/conversations/:id/voice-messages` — Send voice message (SSE stream)
- `POST /api/generate-image` — Generate AI image
- `POST /api/subscribe/video` — Create Stripe checkout session ($10)
- `POST /api/stripe/webhook` — Stripe webhook (marks user as Pro)
- `POST /api/generate-video` — Generate video (Pro users only)

## Deployment
- Target: Autoscale
- Build: `npm run build`
- Run: `npm run start`
