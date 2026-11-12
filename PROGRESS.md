# Project Progress

Last Updated: 2026-11-12
Overall Progress: 99.75%

## Status
- TODO
- IN_PROGRESS
- BLOCKED
- REVIEW
- DONE

## Summary

| Epic | Weight | Progress | Status | Owner |
|---|---|---|---|---|
| P0 Scaffold & Contracts | 5 | 100% | DONE | leader |
| DOC Documentation | 10 | 100% | DONE | docs-agent, leader |
| BE Backend (main) | 30 | 100% | DONE | providers-agent, backend-agent |
| FE Renderer | 25 | 100% | DONE | frontend-agent |
| INT Integration & Review | 10 | 100% | DONE | leader, reviewer |
| QA Testing & UI Review | 15 | 100% | DONE | leader, reviewer |
| PKG Packaging | 5 | 95% | BLOCKED | leader |

## Tasks

| ID | Epic | Task | Owner | Complexity | Model | Reasoning | Status | Progress | Depends On | Validation |
|---|---|---|---|---|---|---|---|---|---|---|
| P0-01 | P0 Scaffold & Contracts | Electron+Vite+React+TS scaffold, shared contracts, migration v1, provider contract | leader | HIGH | opus (inherited) | high | DONE | 100% | - | PASS: npm run build + typecheck + lint clean |
| DOC-01 | DOC Documentation | 17 product/technical docs in /docs with Implemented/Planned/Deferred and phase split | docs-agent | MEDIUM | opus (inherited) | medium | DONE | 100% | P0-01 | all 17 files exist, statuses marked |
| BE-01 | BE Backend (main) | DB connection, migration runner, repositories, immutability, unit tests | backend-agent | HIGH | opus (inherited) | high | DONE | 100% | P0-01 | PASS: db/learning unit tests green (in 145) |
| BE-02 | BE Backend (main) | Providers: safe process runner, Claude Code, Codex, Mock, registry, tests | providers-agent | CRITICAL | opus (inherited) | high | DONE | 100% | P0-01 | 76 unit pass/2 skipped, lint clean; real smoke (latest, QA-03) claude 2.1.322 ~2.5s, codex 0.164.0 ~5.5s; Windows .cmd path unverified |
| BE-03 | BE Backend (main) | Tutor orchestrator, context builder, prompts, skills (Explanation, Quiz, Summary, Curriculum) | backend-agent | HIGH | opus (inherited) | high | DONE | 100% | BE-01 | PASS: tutor/* unit tests green |
| BE-04 | BE Backend (main) | Job runner (persistent, dedupe, concurrency, recovery), curriculum + summary jobs | backend-agent | HIGH | opus (inherited) | high | DONE | 100% | BE-01 | PASS: jobs/runner unit tests green |
| BE-05 | BE Backend (main) | IPC handlers, preload API, app lifecycle, logging, export, window security | backend-agent | HIGH | opus (inherited) | high | DONE | 100% | BE-01, BE-03, BE-04 | PASS: build + typecheck + ipc/logger tests; boot smoke OK |
| FE-01 | FE Renderer | App shell, theme, stores, onboarding, provider setup | frontend-agent | MEDIUM | opus (inherited) | medium | DONE | 100% | P0-01 | PASS: web tsc 0, eslint 0, electron-vite build OK |
| FE-02 | FE Renderer | Dashboard, create course, SVG preset characters with emotion animation | frontend-agent | MEDIUM | opus (inherited) | medium | DONE | 100% | FE-01 | PASS: web tsc 0, eslint 0, build OK; runtime verified by QA-01 E2E + QA-02 screenshots |
| FE-03 | FE Renderer | Classroom (curriculum/chat/character/objectives), quiz UI, settings & data | frontend-agent | HIGH | opus (inherited) | high | DONE | 100% | FE-01 | PASS: web tsc 0, eslint 0, build OK; runtime verified by QA-01 E2E + QA-02 screenshots |
| INT-01 | INT Integration & Review | Integrate all workstreams; build, typecheck, lint, unit green | leader | HIGH | opus (inherited) | high | DONE | 100% | BE-02, BE-05, FE-03 | PASS: typecheck 0, lint 0, vitest 145 pass/2 skip (real-CLI), electron-vite build OK, Mock boot smoke: migration 1 applied + job recovery OK |
| REV-01 | INT Integration & Review | Independent review: CLI execution, IPC/security, DB migration, races; fixes | reviewer | CRITICAL | opus (inherited) | high | DONE | 100% | INT-01 | Reviewer re-verified all fixes; final pass: prod CSP strict in out/ (dev extras serve-only), Windows .cmd quoting SAFE by analysis, last_error never raw stderr, AWS explicit list; latent block-order defect fixed (block held to deleteCourse finally) + test |
| QA-01 | QA Testing & UI Review | Playwright E2E scenarios A–F with Mock | leader | HIGH | opus (inherited) | high | DONE | 100% | INT-01 | 1st run 5/8; 3 spec assumptions fixed (onboarding select→dashboard, title contains lock label, create→classroom) + app fix (failed course card can open classroom); 8/8 pass across runs; final rerun after REV-01 fixes 8/8 (1.6m) |
| QA-02 | QA Testing & UI Review | Real app screenshots (multi-size, light/dark), independent UI review, fixes | leader, reviewer | MEDIUM | opus (inherited) | medium | DONE | 100% | INT-01 | 22 shots (artifacts/screens, 1024/1280/1600 × light/dark); review 4 P1/7 P2/6 P3 → fixed by frontend-agent; independent re-review: 0 new P1, 0 blocking P2; P1-1 (pre-submit quiz colour) rejected by design (answer key not exposed before answering); toast top-right visible; leader checked dark .av-bg tile |
| QA-03 | QA Testing & UI Review | Real CLI smoke (Claude Code, Codex) + performance measurements | leader | MEDIUM | opus (inherited) | medium | DONE | 100% | INT-01 | Real smoke 2/2 (claude 2.1.322 ~2.5s, codex 0.164.0 ~5.5s, AI latency). Local perf (tests/perf, Mock 5ms, M1 Pro/macOS 26.1, n=5 median): restart→dashboard 520ms, dashboard→classroom 29ms, chat round trip 107ms. Recorded in docs/TEST_STRATEGY.md (Performance) |
| PKG-01 | PKG Packaging | macOS package (--dir) and launch smoke | leader | MEDIUM | opus (inherited) | medium | DONE | 100% | INT-01 | PASS: dist/mac-arm64/Rhyme Tutor.app (unsigned, default icon) launched with temp userData: migration 1 + job recovery OK; rebuilt after REV-01/QA-02 fixes and re-smoked OK (2026-11-11) |
| PKG-02 | PKG Packaging | Windows x64 package build + run verification | leader | MEDIUM | opus (inherited) | medium | DONE | 100% | INT-01 | BUILD PASS: NSIS x64 setup + win.zip cross-built on macOS. 사용자 결정으로 해결 처리 (2026-11-12, v0.1.0 릴리스 시점); Windows run not performed |
| PKG-03 | PKG Packaging | Code signing (macOS Developer ID + notarization, Windows Authenticode) | leader, user | MEDIUM | opus (inherited) | medium | BLOCKED | 50% | PKG-01, PKG-02 | CONFIG DONE: electron-builder.yml (mac dmg+zip, hardenedRuntime, env-only credentials), release:mac/release:win scripts, docs/RELEASING.md; unsigned dmg+zip build PASS. SIGNING BLOCKED: no Developer ID / Windows certificate on this machine (resume: follow docs/RELEASING.md) |
| FE-04 | FE Renderer | Seamless UI: frameless window, in-app title bar with minimize/maximize/close | leader | MEDIUM | opus (inherited) | medium | DONE | 100% | FE-03, BE-05 | PASS (Windows 11): typecheck 0, lint 0, build OK, IPC unit 6/6, E2E 9/9 incl. new g-titlebar (min/max/restore/close drive the real window); screenshots light/dark. Unit suite: 2 pre-existing Windows failures in providers/process.test.ts (also fail without this change). macOS traffic-light inset not visually verified |
| BUG-01 | INT Integration & Review | Lesson start/quiz failed with real CLIs (empty stdin prompt); retry stuck on instant failure | leader | MEDIUM | opus (inherited) | medium | DONE | 100% | INT-01 | Root cause: buildContext returned an empty prompt when learnerText was null; claude -p exits 1 ("Input must be provided either through stdin or as a prompt argument"). Fix: TASK_REQUEST_PROMPT user turn + Mock rejects empty prompts like the CLIs + unit test. Renderer retry race (failed event before invoke resolves) fixed in chat-store. PASS: real claude 2.1.322 lesson start completed on a copy of the user DB; unit 208 pass (2 pre-existing Windows process.test failures); E2E 9/9 |
| DOC-02 | DOC Documentation | Sync docs with implementation, final report | docs-agent, leader | LOW | opus (inherited) | medium | DONE | 100% | QA-01, QA-02, PKG-01 | Docs swept for stale Unverified/label/regex statements (resume button "이어서 수업하기" Verified E2E; ADR-002 Accepted; SECURITY §4.4 unified regex); final report delivered |

## Active Work
- None. All agents DONE. Only PKG-03 (code signing) remains, waiting for the user's certificates.

## Blockers
- PKG-03: signing needs an Apple Developer ID certificate + notarization key and a Windows code signing certificate (docs/RELEASING.md).

## Decisions
- Seamless window chrome (2026-11-12, user request): no native title/menu bar. Windows/Linux `frame: false` + custom controls in `TitleBar.tsx`; macOS keeps native traffic lights (`titleBarStyle: 'hidden'`). Contract additions: `IPC.window*`, `EVENTS.windowState`, `TutorApi.window`, `on.windowState`.
- `node:sqlite` (built into Electron 45 / Node 24) + hand-written repositories instead of native better-sqlite3 + Drizzle (no ABI rebuild; see docs/DECISIONS.md).
- CLI providers stateless; all context rebuilt locally each call.
- Claude: `-p --output-format stream-json` with prompt on stdin, `--tools ""`, no `--bare` (breaks OAuth). Codex: `exec --json --ephemeral -s read-only -`.
- DOC-01 open items accepted as proposed: (a) AI topic analysis/clarifying questions → phase 2, MVP uses the form; (b) node:sqlite (ADR-002); (c) brief entities folded/deferred; (d) streak/reminders → phase 2; (f) no provider sessions; (i) next-day resume = currentLessonId + lastStudiedAt + summary; (m) chat is not counted in the job concurrency slot (job limit 1 + at most 1 active chat per course). (e, j, k, l) are revisited in DOC-02 after implementation; (g, h) are verified in QA/PKG.
- Jobs: concurrency 1, maxAttempts 3, backoff [5s, 20s] (no extra cap; RETRY_CAP_MS removed); structured AI output retried up to MAX_STRUCTURED_RETRIES=2, then INVALID_AI_OUTPUT. Model alias: single `MODEL_ALIAS_RE` in src/shared/domain.ts (no leading "-", brackets allowed) used by provider, AppSettingsSchema and settings UI (unified after DOC-02 found 3 divergent copies; tests/unit/model-alias.test.ts). Settings load resets only invalid keys to defaults instead of the whole settings object (tests/unit/db/settings.test.ts).

## Latest Integration Result
- P0: build OK, typecheck 0 errors, lint 0 errors.
- INT-01 (2026-11-11): typecheck 0, lint 0, vitest 16 files/145 pass/2 skipped (real-CLI gated), electron-vite build OK (renderer bundle 1.49 MB — consider code-splitting), Mock boot smoke in temp userData: tutor.db + logs/app.log, migration 1 applied, job recovery complete, no errors.
- Final (2026-11-11, after REV-01/QA-02 fixes): build OK, typecheck 0, eslint 0, vitest 21 files/208 pass/2 skipped (incl. model-alias unification), Playwright E2E 8/8 (1.6m, rerun after regex fix), real-CLI smoke 2/2 (TUTOR_REAL_CLI=1), perf (Mock) medians restart→dashboard 520ms / dashboard→classroom 29ms / chat round trip 107ms, macOS package rebuilt + launch smoke OK.

- REV-01 follow-up (reviewer): regex unification is safe on the Windows cmd path ([ ] literal; & | < > ^ % ! and " blocked); a stored leading-dash alias now resets only that key (per-key repair, tests/unit/db/settings.test.ts).
- Final+1 (2026-11-12, after settings per-key repair): eslint 0, typecheck 0, vitest 22 files/209 pass/2 skipped, build OK, E2E 8/8 (1.6m), macOS package rebuilt + launch smoke OK (migration 1 applied, recovery complete, 0 error lines).

- Release v0.1.0 (2026-11-12): AGPL-3.0-only license added; typecheck 0, lint 0, vitest 209 pass/2 skipped, E2E 8/8; mac (dmg+zip) and win (nsis+zip) built unsigned.

## Known Issues
- Builds are unsigned until PKG-03 is done, and use the default Electron icon (macOS Gatekeeper / Windows SmartScreen warnings).
- Windows run and provider terms re-check: 사용자 결정으로 해결 처리 (2026-11-12, v0.1.0 릴리스 시점); not executed on a real Windows host / against terms text.
- Codex `-s read-only` sandbox can still read any file the user can read (scratch cwd sets the working root only); Claude runs with `--tools ""`.
- CSP is delivered via meta tag, so `frame-ancestors` has no effect (other directives honoured).
- Renderer bundle 1.49 MB (no code-splitting yet).
- CHILD_ENV_ALLOWLIST names need confirmation against current CLI docs.
- JSON export: mode 0o600 applies only on file creation (overwrites keep existing permissions); export contains learner content and should be treated as sensitive. Verified (REV-01): background_jobs.last_error stores only fixed Korean messages, never raw CLI stderr.
- Settings does not indicate which detected CLI is the active provider (QA-02 P3). Screenshot DPR differs across sizes (2.5x at 1024/1280, 2.0x at 1600).
- Course deletion: a queued job of the course being deleted may be claimed and immediately cancelled (status queued→running→cancelled) but is never executed (unit-tested). Accepted; filtering blocked courses in claimNextJob is optional.
