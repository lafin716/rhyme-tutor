# MASTER PLAN — Rhyme Tutor (Phase 1 MVP)

## Goal
Runnable, buildable Electron desktop app that delivers the success flow:
앱 실행 → 성향 설문 → AI 연결 → 학습 주제 생성 → 나만의 선생님 생성 → 커리큘럼 생성 → 채팅 수업 → 퀴즈 → 기록 저장 → 다음 날 학습 재개.

## Scope
- **In (Phase 1 / MVP)**: MVP-01..12 from the brief — init/DB/migrations/logging, onboarding, providers (Claude Code, Codex, Mock),
  course creation (immutable identity), 4 preset 2D characters, tutor chat (stream/cancel/retry/restore),
  curriculum (background job, Zod validated), lesson progress with evidence, quiz (MC/OX, stored answers),
  session summary + memory + context builder, minimal job runner, settings/data/export.
- **Out (Phase 2/3)**: see `docs/MVP_SCOPE.md`, `docs/ROADMAP.md` (Live2D/3D, voice, assignments, exams,
  spaced repetition, gamification, notifications, RAG, sandbox, cloud, multi-agent workers).

## Contracts (leader-owned, change only via leader)
- `src/shared/domain.ts` — domain types + Zod input schemas + error codes
- `src/shared/ipc.ts` — IPC channels, events, `TutorApi`
- `src/shared/presets.ts`, `src/shared/onboarding.ts`, `src/shared/ai-schemas.ts`
- `src/main/providers/types.ts` — `AIProvider`, `ProviderRegistry`, `ProviderError`
- `src/main/db/migrations.ts` — append-only schema

## Workstreams / ownership
| Workstream | Owner | Owned paths |
|---|---|---|
| Docs | docs agent | `docs/*.md` except MASTER_PLAN, ARCHITECTURE, TEST_STRATEGY |
| Providers | providers agent | `src/main/providers/**` (except types.ts), `tests/unit/providers/**` |
| Core backend | backend agent | `src/main/**` (except providers/, db/migrations.ts), `src/preload/index.ts`, `tests/unit/**` (except providers/) |
| Renderer | frontend agent | `src/renderer/**` |
| Integration, E2E, packaging, PROGRESS | leader | `tests/e2e/**`, config files, PROGRESS.md, AGENTS.md |

## Sequence
1. P0 scaffold + contracts (done) → 2. parallel: docs, providers, backend, renderer →
3. leader integration (build/typecheck/lint/unit) → 4. independent review (security/CLI/DB/races) + fixes →
5. E2E A–F with Mock → 6. real-app screenshots + UI review + fixes → 7. packaging mac (+ Windows attempt) →
8. docs sync + final report.

## Done criteria
0 TS errors, 0 ESLint errors, unit 100% pass, E2E pass, concurrent course creation no duplicates, cancel kills process,
full flow via Mock, mac package launches, Windows package build attempted and reported honestly.
