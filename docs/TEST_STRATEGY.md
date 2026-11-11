# TEST STRATEGY

| Layer | Tool | What |
|---|---|---|
| Static | `npm run typecheck`, `npm run lint` | strict TS (node + web projects), ESLint incl. renderer import bans |
| Unit | Vitest (`tests/unit/**`, node env, real `node:sqlite` in-memory/temp DB) | migrations, repositories, course immutability (repo + trigger), idempotent course create / message insert, objective evidence rules, quiz grading, context builder budget, prompt sections, job runner (dedupe, concurrency, recovery), provider stream parsers, process runner cancel/timeout (fake child scripts), Mock provider outputs vs Zod schemas, `extractJson` |
| E2E | Playwright `_electron` against `out/` build, Mock provider, `TUTOR_USER_DATA_DIR` temp dir | scenarios A–F (below) |
| Manual / real | `npm run dev` with real Claude Code / Codex | one short chat + curriculum generation per provider (latency recorded separately) |
| UI | screenshots 1280×820, 1024×700, 1600×1000, light + dark; independent review | layout, empty/error states |
| Packaging | electron-builder `--mac --dir` (launch smoke), `--win` (build attempt) | |

## E2E scenarios
- **A 첫 사용자**: fresh data dir → onboarding 5 questions (prev/next) → provider setup → dashboard empty state.
- **B AI 연결**: provider list shows Claude/Codex/Mock with status; select Mock; settings reflects it.
- **C 주제 생성**: create "Kubernetes" course with preset → dashboard card → curriculum job → ready; title not editable; double-submit creates one course.
- **D 수업**: classroom → tutor intro streams → learner message → reply saved → restart app → history restored & current lesson resumed; cancel mid-stream; retry failed reply (no duplicates).
- **E 퀴즈**: generate quiz → answer → graded against stored answer → explanation → objective evidence → flag question.
- **F 실패 처리**: Mock failure injection → friendly error + retry; learner message preserved; curriculum failure → retry button.

## Performance

앱·DB·UI 비용(Mock)과 실제 AI 지연(실제 CLI)은 따로 기록한다. 최신 수치와 판정의 원천은 [PROGRESS.md](../PROGRESS.md)다.

### 로컬 성능 (QA-03, Mock provider, 응답 지연 5 ms)
- 측정 환경: Apple M1 Pro, macOS 26.1, n=5. 표는 min / median / max (ms).
- 측정 위치: `tests/perf/perf.spec.ts`, 설정 `playwright.perf.config.ts`. `npm run test:e2e`에는 포함되지 않는다.
- 실행: `npm run build && npx playwright test -c playwright.perf.config.ts` (결과는 `test-results/perf.json`).

| 항목 | min | median | max |
|---|---|---|---|
| 채팅 왕복 (사용자 메시지 저장 → 스트림 → 응답 저장) | 102 | 107 | 116 |
| 재시작 → 대시보드 (코스 카드 표시) | 436 | 520 | 545 |
| 대시보드 → 수업 화면 (이전 대화 표시) | 29 | 29 | 37 |

- median 값은 PROGRESS.md와 일치한다. min/max 값은 리더가 같은 조건(n=5)으로 직접 측정해 확인했다. 측정 결과 파일 `test-results/perf.json`은 보관하지 않았다.
- 이 수치는 AI 지연을 포함하지 않는다.

### 실제 CLI 스모크 (AI 지연)
- `TUTOR_REAL_CLI=1`로 실행한 `tests/unit/providers/real.smoke.test.ts` 기준. 한 번의 짧은 호출 시간이다.
- Claude Code 2.1.322: 약 2.5 s
- Codex 0.164.0: 약 5.5 s
- 이전 BE-02 기록(claude 약 1.3 s, codex 약 4.5 s)은 대체되었다. 단일 측정이므로 변동이 있을 수 있다.

### 스크린샷
- `SCREENS_DIR=artifacts/screens npx playwright test -c playwright.screens.config.ts`로 생성한다 (22장, 1024/1280/1600 × 라이트/다크).
