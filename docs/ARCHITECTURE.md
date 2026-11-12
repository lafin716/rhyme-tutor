# ARCHITECTURE — Rhyme Tutor

> Status legend: **Implemented** (1차 MVP, verified in `src/`) · **Planned** (2차/3차, designed, not in `src/`) · **Deferred** (not scheduled)
> Test counts and performance numbers are not repeated here. See `PROGRESS.md`.

## 1. Overview

Local-first Electron desktop app. No server. All learning state lives in a local SQLite file
(`<userData>/tutor.db`). AI is delegated to a CLI already installed and logged in on the user's machine
(Claude Code / Codex CLI, marked experimental) or to an in-process Mock provider (always listed; failure
markers need `TUTOR_ENABLE_MOCK=1`). Implemented.

```
┌──────────────────────── Renderer (React, sandboxed) ───────────────────────┐
│ Onboarding · ProviderSetup · Dashboard · CreateCourse · Classroom · Settings │
│ Zustand stores ── window.tutor (TutorApi) ── no Node, no fs, no child_process │
└───────────────▲─────────────────────────────────────────────┬──────────────┘
                │ contextBridge (preload, CJS, sandbox:true)    │ ipcRenderer.invoke
                │ EVENTS: chat:event / jobs:event / courses:event ▼
┌──────────────────────────────── Main process ──────────────────────────────┐
│ ipc/        handlers: Zod-validate input → service → Result<T> envelope      │
│ learning/   LearningService (courses, lessons, quiz, evidence, delete gate)  │
│ tutor/      TutorOrchestrator · ContextBuilder · PromptBuilder · skills/     │
│ jobs/       JobRunner (persistent queue, dedupe, retry, startup recovery)    │
│ ai-slot.ts  global AI slot (limit 1) shared by chat, jobs, quiz generation   │
│ course-gate.ts  in-memory delete gate per course                             │
│ providers/  ProviderRegistry → ClaudeCode | Codex | Mock (spawn, shell:false)│
│ db/         node:sqlite DatabaseSync · migrations · repo-core / repo-learning │
│ log/        rotating file logger (<userData>/logs) — no prompt/secret dumps  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Process & security model (Implemented unless marked)

| Rule | How | Status |
|---|---|---|
| contextIsolation on, nodeIntegration off, sandbox on | `BrowserWindow.webPreferences` in `src/main/index.ts` | Implemented |
| Renderer has no system access | preload exposes only `TutorApi` (`src/shared/ipc.ts`); ESLint forbids `electron`/`node:*` imports in renderer | Implemented |
| Navigation blocked | `will-navigate` prevented; `setWindowOpenHandler` denies new windows | Implemented |
| External links | opening external http(s) URLs through `shell.openExternal` | Planned. `shell` is used in main only for `openPath` (export folder) |
| CSP | `src/renderer/index.html` meta tag: `default-src 'self'`, `connect-src 'self'`, no remote scripts. `frame-ancestors` has no effect when delivered via meta | Implemented (see SECURITY.md) |
| IPC sender check | `isTrustedSender` checks the sender frame URL | Implemented |
| Frameless window (seamless UI) | Windows/Linux `frame: false`, macOS `titleBarStyle: 'hidden'` (native traffic lights). In-app `TitleBar.tsx` draws min/max/close via `window:*` IPC (same sender check, acts only on the main window); `.app-drag` CSS marks title bar and page headers as drag regions | Implemented (E2E `g-titlebar` on Windows; macOS not visually verified) |
| All IPC inputs validated | Zod schemas in `src/shared/domain.ts`, parsed in main before use | Implemented |
| CLI execution only in `src/main/providers/*` | `spawn(file, staticArgs, { shell:false })`. User text goes via **stdin** only, never argv or a shell string | Implemented |
| Executable resolution | search `PATH` (+ well-known install dirs) for `claude`/`codex`; must be an absolute, existing, regular file. Windows prefers `.exe`; `.cmd`/`.bat` run through ComSpec with restricted argv | Implemented (Windows run unverified) |
| Environment allow-list | child processes receive only the names in `CHILD_ENV_ALLOWLIST` (`src/main/providers/resolve.ts`, see SECURITY.md) | Implemented |
| Model alias validation | `validateModelAlias` in `resolve.ts` (no leading `-`, see AI_PROVIDER §7) | Implemented |
| No credential access | detection uses `claude auth status` / `codex login status` only. The app never reads `~/.claude`, `~/.codex`, keychains or tokens | Implemented |
| Process cleanup | timeout + AbortSignal → kill the process tree. POSIX: detached process group, SIGTERM then SIGKILL after 1500 ms. Windows: `taskkill /pid N /T /F` | Implemented |

## 3. AI provider layer (Implemented: Claude Code, Codex, Mock)

Contract: `src/main/providers/types.ts` (`AIProvider.detect()`, `AIProvider.complete()`). Leader-owned.
Provider sessions are **not** used; every call is self-contained, so switching providers never loses context.

| Provider | Invocation (cwd = empty per-call scratch dir under the app temp root) | Streaming |
|---|---|---|
| Claude Code | `claude -p --output-format stream-json --verbose --include-partial-messages --tools "" --no-session-persistence --setting-sources project --strict-mcp-config --disable-slash-commands --system-prompt-file <tmp> [--model m]`, prompt on stdin | token deltas (`stream_event` → `content_block_delta.text_delta`), final `result` line |
| Codex CLI | `codex exec --json --skip-git-repo-check --ephemeral -s read-only -C <scratch-dir> [-m m] -`. System instructions and prompt are both sent on stdin, wrapped in `<system_instructions>` / `<user_message>` | whole message (`item.completed` `agent_message`). Top-level `error` events are non-fatal and ignored. `turn.failed` is fatal |
| Mock | in-process, deterministic, schema-valid JSON per `task`; supports cancel/timeout; failure markers gated by `TUTOR_ENABLE_MOCK=1` | simulated chunks (`TUTOR_MOCK_DELAY_MS`) |

- `-C <scratch-dir>` sets the Codex working root to the empty scratch dir. It does **not** restrict reads (see PROGRESS Known Issues).
- Error mapping → `AppErrorCode` (not installed / auth required / rate limited / timeout / cancelled / failed / invalid output). Korean messages come from `MESSAGES_KO` in `resolve.ts`.
- Distribution: both CLIs are used through their documented non-interactive modes under the user's own login. The adapters are marked `experimental`. Official API providers are **Planned** (see AI_PROVIDER §8).

## 4. Tutor engine (Implemented)

- **TutorOrchestrator** (`src/main/tutor/orchestrator.ts`): one active chat request per course (otherwise `BUSY`). Calls wait in the global AI slot (§6).
  Flow for `chat.send`: tx{insert learner message (idempotent by `clientMessageId`) + insert tutor message `streaming` + `recordStudyActivity`} →
  emit `started` → build context → `provider.complete(onDelta → throttled DB update + delta events)` →
  tx{finalize tutor message `complete`} → emit `completed`.
  Failure → tutor message `error` with `errorCode` (learner message kept) → `failed`. Cancel → partial text kept, `cancelled`.
  `retry(tutorMessageId)` re-runs **the same row** (content reset, status `streaming`). No duplicates.
  The orchestrator does **not** enqueue jobs. Summary jobs are enqueued by the learning service on lesson completion (§6).
- **PromptBuilder** (`src/main/tutor/prompts.ts`): versioned sections `core`, `character`, `learner`, `course`, `lesson`, `memory`, `skill`. `PROMPT_VERSION` is stored on the tutor character. Pure functions, unit-tested.
- **ContextBuilder** (`src/main/tutor/context.ts`): `CONTEXT_BUDGET_CHARS` = 12,000; `MAX_MEMORIES` = 10 (evidence first); `MAX_MESSAGE_CHARS` = 1,500 per message. Contents: latest summary (never trimmed), current lesson and objectives with status, quiz stats, memories, and recent messages **after** the summary cut (at most `CHAT_HISTORY_WINDOW` = 40 rows). Trim order when over budget: messages → quizStats → objectives → memories. The full history is never sent.
- **Skills** (`src/main/tutor/skills.ts`): `ExplanationSkill` (chat/lesson), `QuizSkill`, `LearningSummarySkill`, `CurriculumSkill`. Implemented.
  Planned: Assignment, Assessment, Review, Pronunciation, Practice, Visualization (designed only).
- **Structured outputs**: `completeStructured` parses with `extractJson` and Zod. `MAX_STRUCTURED_RETRIES` = 2 with a corrective suffix, then `INVALID_AI_OUTPUT` (`AI 응답 형식이 맞지 않아요.`). Implemented.
- **AI behaviour** (tutor persona, no direct progress changes): prompt-guided, not enforced by code beyond the evidence rules in §5.

## 5. Learning state & evidence (Implemented)

- Course → Module → Lesson → Objective. Course `id`, `request_id`, `title`, `topic_prompt`, `created_at` are immutable: the repository patch schema excludes them **and** SQLite trigger `courses_immutable_identity` aborts with `COURSE_IMMUTABLE`.
- Objective status changes only through rows in `objective_evidence`:
  - `quiz`: a correct answer → `achieved`; a wrong answer → `needs_review`. A wrong answer on an already `achieved` objective keeps it `achieved`.
  - `self_report`: learner-initiated self check (`selfCheck`) writes evidence. It does not write `learning_memories` (open item j).
  - The AI never changes progress directly. Model output is not used for grading (quiz is graded against stored `answer_index`).
- Lesson completion (`lessons.complete`) is an explicit learner action. It does not depend on objective status.
- Memories carry `confidence: evidence | ai_inferred` so AI judgements are kept apart from graded data.
- Lesson transition: `selectLesson` (learner picks a lesson), and chat `send` / `startLesson` bump `last_studied_at` (see TUTOR_ENGINE §3.1 and DATA_MODEL §6.2).

## 6. Background jobs and the AI slot (Implemented: minimal)

- `background_jobs` table. `JobRunner` (`src/main/jobs/runner.ts`) polls the queue (`JOB_POLL_MS` = 1000) by priority.
- **Global AI slot** (`src/main/ai-slot.ts`): limit 1, shared by chat, background jobs and quiz generation. There is no priority or preemption. A chat call waits behind a running job; a job waits behind a running chat. Chat is therefore **not** free of the slot (this corrects PROGRESS Decisions (m)).
- **Per-course BUSY**: a second chat request for the same course while one is active returns `BUSY` immediately (before the slot).
- Dedupe via partial unique index `uq_jobs_active_dedupe` on active `dedupe_key` (`queued`/`running`). A duplicate active insert returns the existing id.
- Retry: `maxAttempts` = 3. Backoff `RETRY_DELAYS_MS` = [5 s, 20 s] (no further cap). Retryable codes are listed in `RETRYABLE_CODES`. Auth-required is not retried.
- Job types:
  - `curriculum_generation`: on course create and on retry.
  - `session_summary`: enqueued by the learning service on **lesson completion only**, and only when messages exist after the current summary's `covered_until_seq`. No message-count trigger exists in code.
- Startup recovery (`recoverOnStartup`, one transaction): `running` jobs → `queued`; `streaming` tutor messages → `error` with `PROVIDER_FAILED` (fixed text only when the content is empty); courses still `generating` with no queued/running curriculum job → `failed` ("앱이 종료되어 중단되었어요"). A job re-queued by a shutdown keeps its attempt count. Recovery counts are logged. **No `notice` message row is written** for interrupted replies (TUTOR_ENGINE §3.2, Planned for 2차).
- Course deletion uses the delete gate (`src/main/course-gate.ts`: `begin`, `end`, `assertOpen`). Ordering, abort handling and race rules are in BACKGROUND_JOBS §8. Summary: the gate is closed before the abort/cascade, and released in `finally`. Writes to a closing course fail with `NOT_FOUND`.
- Jobs run only while the app runs (no daemon). Planned workers: Assignment, Assessment, Review, Analytics.

## 7. Data (Implemented)

`node:sqlite` (`DatabaseSync`, built into Electron 45's Node 24) — no native module, no ABI rebuild.
Connection pragmas: `foreign_keys = ON`, `journal_mode = WAL`, `synchronous = NORMAL`, `busy_timeout` (default 5000 ms).
Migrations: `src/main/db/migrations.ts`, append-only. Each migration runs in `BEGIN IMMEDIATE` … `COMMIT` and is recorded in `schema_migrations`. A failing migration rolls back and throws `MigrationError`; the app does not open a half-migrated DB.

**Backup before migrating (Implemented, `src/main/db/connection.ts`)**: when the DB already has a schema version (`current > 0`) and pending migrations exist, the DB file is checkpointed (`wal_checkpoint(TRUNCATE)`) and copied to `tutor.db.bak-<fromVersion>` (never overwritten; a numeric suffix is added if needed). A fresh DB (version 0) is not backed up. Refusing to open a DB written by a newer build (`DbVersionTooNewError`) is also implemented.

Deleting a course cascades to all dependent rows (see DATA_MODEL §4). Export: JSON dump of learner tables via a native save dialog in main. Export file mode `0o600` applies on creation only (see SECURITY.md).

## 8. Renderer (Implemented)

React 19 + Zustand + Tailwind v4. Routes (in-memory): onboarding → provider setup → dashboard → create course → classroom → settings. Classroom: curriculum, chat, avatar (SVG, emotion states), objectives and quiz panel. Markdown via `react-markdown` + `remark-gfm` (no raw HTML). Theme: system/light/dark.
Dashboard resume button is labelled "이어서 수업하기" (CourseCard `course-open`) and is verified by E2E (`tests/e2e/helpers.ts` `openFirstCourse`). Not verified in this review: the responsive collapse threshold (earlier draft said ~1100 px). Treat as design intent until checked in `src/renderer`.

## 9. Directory layout (as in `src/`)

```
src/shared/      domain.ts ipc.ts ai-schemas.ts presets.ts onboarding.ts   (leader-owned contracts)
src/main/        index.ts ai-slot.ts course-gate.ts log/ db/ providers/ tutor/ jobs/ learning/ ipc/
src/preload/     index.ts
src/renderer/    index.html, main.tsx, App.tsx, store/, pages/, components/, lib/
tests/unit/      vitest (db, repos, immutability, providers, context, prompts, jobs, quiz grading)
tests/e2e/       Playwright _electron with Mock provider and isolated user data dir
tests/perf/      local timing measurements (see TEST_PLAN §8)
tests/screens/   screenshot capture spec (playwright.screens.config.ts)
docs/            product + technical docs
```

## 10. Environment variables (dev / test only)

| Var | Default | Purpose | Status |
|---|---|---|---|
| `TUTOR_USER_DATA_DIR` | OS userData | override the data directory (E2E and screenshot isolation) | Implemented |
| `TUTOR_ENABLE_MOCK` | off | when `1`, Mock failure markers (`[[mock:*]]`) are honoured. Mock is always listed as a provider; this flag only gates the markers (checked per call) | Implemented |
| `TUTOR_MOCK_DELAY_MS` | 15 | Mock per-chunk delay | Implemented |
| `TUTOR_REAL_CLI` | off | enables the real-CLI smoke test (`tests/unit/providers/real.smoke.test.ts`); not used by CI or E2E | Implemented (test only) |

Mock's release-build visibility (hide in release builds) is Planned (2차), see DECISIONS.md.
