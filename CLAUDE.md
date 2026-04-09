# CardioCAn - Project Conventions

## Overview
PWA de monitoreo cardíaco para perros con insuficiencia cardíaca. Permite medición manual y automática (vía video+AI) de frecuencia respiratoria. Incluye compartir datos entre cuidadores en tiempo real, recordatorios de medicación y exportación de historial para el veterinario.

## Tech Stack
- **Framework**: Next.js (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS
- **Database**: Cloudflare D1 (via Drizzle ORM)
- **Hosting**: Vercel
- **Charts**: Recharts

## Project Structure
```
app/              # Next.js App Router pages and layouts
  api/            # API routes
  (auth)/         # Auth-related pages
lib/              # Shared utilities, DB schema, helpers
public/           # Static assets, PWA manifest, icons
migrations/       # D1 database migrations (Drizzle)
```

## Conventions
- Use ES module imports with the `@/*` alias
- All components use TypeScript with explicit prop types
- Server Components by default; add `"use client"` only when needed
- API routes return typed JSON responses
- Database queries go through Drizzle ORM
- Keep components small and composable
- UI text in Spanish (user-facing), code in English

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `npm run lint` — ESLint
- `npx drizzle-kit generate` — Generate D1 migrations
- `npx drizzle-kit migrate` — Apply migrations

## Environment Variables
See `.env.example` for required variables.
