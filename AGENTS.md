# AGENTS.md — Rhyme Tutor

- Read first: `PROGRESS.md` (single source of truth), `docs/MASTER_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/TEST_STRATEGY.md`.
- Contracts (`src/shared/*`, `src/main/providers/types.ts`, `src/main/db/migrations.ts`) are leader-owned. Propose changes, don't edit silently.
- Migrations are append-only. Never edit a shipped migration.
- Security: CLI execution only in `src/main/providers/*` via `spawn(..., { shell:false })`; user text only via stdin/temp files; never read CLI credential files; renderer never imports `electron`/`node:*`.
- Course identity (id, request_id, title, topic_prompt, created_at) is immutable.
- Objective progress changes require evidence rows; the AI never marks progress by itself.
- Commands: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:e2e`, `npm run package:mac`, `npm run package:win`.
- Dev server binds `0.0.0.0`, allowedHosts includes `.ts.net`.
- UI language: Korean.
