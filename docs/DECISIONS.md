# DECISIONS — 설계 결정 기록 (ADR)

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 형식: 각 ADR은 상황, 결정, 대안, 결과를 적는다. 계약 파일(`src/shared/*`, `src/main/providers/types.ts`, `src/main/db/migrations.ts`)의 변경은 리더 승인 후에만 반영한다.
> 상태 "Accepted"는 설계 확정을 뜻하며, 구현 검증 결과가 아니다.

## 목차

| ID | 제목 | 상태 |
|---|---|---|
| ADR-001 | Electron + React + Vite 스택 | Accepted |
| ADR-002 | node:sqlite와 수작업 저장소 (Drizzle 미사용) | Accepted |
| ADR-003 | CLI 기반 Provider, 무상태 호출 | Accepted |
| ADR-004 | 실험적 CLI 구독 경로 분류 | Accepted |
| ADR-005 | Mock Provider와 실패 마커 | Accepted |
| ADR-006 | 주제 불변성 3중 방어 | Accepted |
| ADR-007 | 영속 작업 큐와 전역 AI 동시성 1 | Accepted |
| ADR-008 | 근거 기반 목표 달성 (AI 단독 진도 변경 금지) | Accepted |
| ADR-009 | 2D SVG 프리셋 캐릭터 4종 | Accepted |
| ADR-010 | JSON 내보내기 (main 저장 대화상자) | Accepted |
| ADR-011 | 1차 설문 형식 (AI 명확화 질문 미사용) | Accepted |
| 열린 항목 | 리더 결정 필요 목록 (a–l) | Open |

---

## ADR-001 Electron + React + Vite 스택

- **상황**: 로컬 우선 데스크톱 앱이 필요하고, CLI를 실행할 수 있어야 한다. 웹 UI 생산성을 유지하고 싶다.
- **결정**: Electron 45.3.0, React 19.3.1, electron-vite 6.0.0 (Vite 8.3.8), Zustand 5.1.0, Tailwind CSS 4.3.5, react-markdown 10.1.0, remark-gfm 4.0.1. 검증은 Zod 4.6.7.
- **보안 설정**: contextIsolation on, nodeIntegration off, sandbox on. Preload는 CJS.
- **대안**: Tauri (Rust 빌드 체인 부담), 순수 웹 + 로컬 서버 (파일 권한과 배포 경로 복잡).
- **결과**: 메인 프로세스가 CLI와 DB를 전담한다. Windows 실행 검증은 별도 호스트가 필요하다 (열린 항목 g, h).

## ADR-002 node:sqlite와 수작업 저장소 (Drizzle 미사용)

- **상황**: 브리프는 Drizzle을 언급한다. 리더 계약은 `node:sqlite`(DatabaseSync)와 수작업 저장소, 마이그레이션 러너를 정했다.
- **결정**: `node:sqlite` 사용. 마이그레이션은 `src/main/db/migrations.ts`에 추가만 한다 (append-only). `PRAGMA foreign_keys=ON`, `journal_mode=WAL`.
- **이유**: 네이티브 모듈(better-sqlite3) 재빌드 부담 제거, 의존성 축소, Electron ABI 문제 회피.
- **대안**: Drizzle + better-sqlite3 (네이티브 재빌드 필요), Drizzle + libsql.
- **결과**: 쿼리를 직접 작성한다. 타입 안전은 저장소 함수 시그니처와 Zod로 확보한다.
- **위험**: Node 24의 `node:sqlite`는 실험 단계 경고를 낼 수 있고 API가 바뀔 수 있다. 버전을 고정하고 경고 표시 여부를 검증 항목으로 둔다 (열린 항목 g).

## ADR-003 CLI 기반 Provider, 무상태 호출

- **상황**: 학습자가 이미 쓰는 Claude Code 또는 Codex를 AI로 쓰고 싶다. 앱이 자격 증명을 다루면 위험이 커진다.
- **결정**:
  - 실행은 `src/main/providers/*`에서만. `spawn(..., { shell: false })`.
  - 사용자 텍스트는 stdin 또는 임시 파일로만 전달.
  - 자격 증명 파일은 읽지 않는다. 탐지는 `claude auth status`, `codex login status` 같은 공식 명령만 사용.
  - 호출마다 새 프로세스. 제공사 세션 ID를 저장하거나 이어 쓰지 않는다 (`--no-session-persistence`, `--ephemeral`).
  - Claude Code는 `--bare`를 쓰지 않는다 (OAuth 인증이 비활성화되므로).
- **결과**: 앱 기억은 전부 로컬 DB(요약, 기억, 메시지)에 있다. "AI 세션 ID"와 "제공사 세션 ID"는 개념상 구분하며 매핑 테이블이 없다 (열린 항목 f).
- **대안**: 제공사 세션 재사용 (CLI 내부 상태 의존, 재현성 낮음), 자격 증명 파일 직접 읽기 (금지).

## ADR-004 실험적 CLI 구독 경로 분류

- **상황**: CLI 구독을 제3자 앱에서 자동 호출하는 것이 제공사 약관상 허용되는지 불명확할 수 있다.
- **결정**: CLI 구독 경로를 `experimental`로 분류한다. 배포 기본 경로로 내세우지 않는다. 공식 API 경로(Anthropic API, OpenAI API)는 2차 Planned로 두고 키는 OS 보안 저장소에 둔다.
- **규칙**: 릴리스 전 제공사 약관을 재확인하고 결과를 이 문서에 날짜와 함께 추가한다. 조항 번호는 확인 전까지 인용하지 않는다.
- **결과**: 실험적 어댑터는 설정으로 비활성화할 수 있어야 한다 (ROADMAP 2차 정책 항목과 연결).

## ADR-005 Mock Provider와 실패 마커

- **상황**: 실 CLI 없이 전체 흐름과 실패 경로를 테스트해야 한다. CI에 인증 정보가 없다.
- **결정**: `TUTOR_ENABLE_MOCK` 환경 변수로 활성화. 지연은 `TUTOR_MOCK_DELAY_MS` (기본 15ms). 마커 `[[mock:fail]]`, `[[mock:auth]]`, `[[mock:ratelimit]]`, `[[mock:invalid]]`, `[[mock:slow]]`로 오류 코드를 재현한다. 데이터 디렉터리는 `TUTOR_USER_DATA_DIR`.
- **구현 현황 (2026-11-11)**: Mock은 `ProviderRegistry`에 항상 등록되고 탐지 목록에 항상 나타난다(`experimental: false`). 실패 마커는 `TUTOR_ENABLE_MOCK=1`일 때만 동작하며 호출마다 환경 변수를 확인한다.
- **미구현 (Planned)**: 릴리스 빌드에서 Mock을 목록에서 숨기는 규칙은 아직 없다. 숨기기는 2차 항목으로 둔다. ARCHITECTURE 10절과 맞추기 위해 현재 동작을 그대로 기록한다.
- **결과**: E2E와 단위 테스트가 실 CLI에 의존하지 않는다.

## ADR-006 주제 불변성 3중 방어

- **상황**: 주제의 정체성(id, request_id, title, topic_prompt, created_at)은 바뀌면 안 된다. 멱등성과 추적의 기준이다.
- **결정**: 세 층에서 막는다.
  1. Zod `UpdateCourseInputSchema`: goal, level, pace만 허용하는 `.strict()` 객체
  2. 저장소 함수: 위 세 필드만 UPDATE
  3. SQLite 트리거 `courses_immutable_identity`: `BEFORE UPDATE OF ...`에서 `RAISE(ABORT, 'COURSE_IMMUTABLE')`
- **결과**: 어느 한 층이 빠져도 나머지가 막는다. 사용자에게는 "주제 이름과 원문은 바꿀 수 없어요"로 안내한다.

## ADR-007 영속 작업 큐와 전역 AI 동시성 1

- **상황**: 커리큘럼 생성과 요약은 수 초 이상 걸린다. 앱 종료에도 상태가 남아야 한다. 로컬 CLI를 동시에 여러 개 띄우면 한도와 비용 문제가 생긴다.
- **결정**: `background_jobs` 테이블, 메인 프로세스의 단일 루프, 전역 AI 슬롯 1. 중복은 부분 유니크 인덱스 `uq_jobs_active_dedupe`로 막는다. 최대 시도 3(`max_attempts`), 재시도 백오프 `[5초, 20초]`. 시작 시 `running`은 `queued`로 복구.
- **2026-11-11 갱신 (구현 기준)**:
  - 백오프 상한 60초 규칙은 폐기했다. `RETRY_CAP_MS`는 제거되었고 추가 상한은 없다.
  - 전역 AI 슬롯(`AiSlot`, 한도 1)은 채팅 응답, 백그라운드 작업, 퀴즈 생성이 공유한다. 채팅을 작업보다 먼저 실행하는 우선순위나 선점은 1차에 없다. 자세한 정책은 열린 항목 m.
  - 구조화 출력 교정 재시도는 Skill 안에서 최대 2회(`MAX_STRUCTURED_RETRIES`)다. 그 뒤에도 실패하면 `INVALID_AI_OUTPUT`이 되고 작업 단위 재시도 대상이다.
- **열린 쟁점**: 채팅 응답과 백그라운드 작업이 같은 슬롯을 쓰므로 채팅 대기가 길어질 수 있다. 우선순위 도입은 2차 검토 (BACKGROUND_JOBS 10절).
- **대안**: 외부 큐(Redis), 워커 프로세스 분리 (로컬 단일 사용자 앱에 과함, 3차 이후 검토).

## ADR-008 근거 기반 목표 달성 (AI 단독 진도 변경 금지)

- **상황**: AI가 "잘 이해했다"고 말하는 것만으로 진도가 바뀌면 학습 기록이 신뢰를 잃는다.
- **결정**:
  - 목표 `achieved`는 `objective_evidence` 행(kind: `quiz` 또는 `self_report`)이 있을 때만.
  - 단원 완료는 학습자의 명시적 액션.
  - AI 출력은 진도 상태를 바꾸지 않는다. 제안만 할 수 있다.
  - 퀴즈 채점은 저장된 `answer_index`와 main 프로세스가 비교한다.
- **결과**: 기억 항목은 `confidence`가 `evidence` 또는 `ai_inferred`로 구분된다.

## ADR-009 2D SVG 프리셋 캐릭터 4종

- **상황**: 1차에서 캐릭터 표현은 가볍고 빠르게 만들어야 한다. 3D와 Live2D는 에셋과 라이선스 비용이 크다.
- **결정**: 코드로 그리는 2D SVG 아바타 4종 (kind-explainer 하린, strict-coach 도윤, motivator 하루, researcher 이안). 3D·Live2D·음성은 3차 Planned.
- **결과**: 외형 커스터마이징은 1차에 없다. 프리셋 데이터는 `src/shared/presets.ts`가 원천.
- **주의**: 프리셋 이름과 말투는 학습 경험 설계 항목이며 외부 캐릭터를 모사하지 않는다.

## ADR-010 JSON 내보내기 (main 저장 대화상자)

- **상황**: 학습 기록을 사용자가 가져갈 수 있어야 한다. 파일 경로를 Renderer가 정하면 경로 조작 위험이 생긴다.
- **결정**: 저장 대화상자는 main에서 연다. 포맷 버전 필드를 포함한다. API 키와 CLI 자격 증명은 제외한다 (SECURITY 6절).
- **가져오기**: Deferred.

## ADR-011 1차 설문 형식 (AI 명확화 질문 미사용)

- **상황**: 브리프는 AI가 주제를 분석하고 짧게 되묻기를 원한다. 1차에 포함하면 검증 범위와 AI 의존이 커진다.
- **결정**: 1차는 폼 입력과 5문항 온보딩. 명확화 질문은 2차 Planned.
- **결과**: MVP_SCOPE 4절의 조정 사항과 일치.

---

## 열린 항목 (리더 결정 필요)

브리프와 계약 사이의 불일치를 모아 둔다. 해결되면 상태를 바꾸고 날짜를 적는다.

| 항목 | 내용 | 관련 문서 | 상태 |
|---|---|---|---|
| a | 브리프 2.4의 AI 주제 분석·명확화 질문: 1차는 폼으로 대체 | PRD, MVP_SCOPE 4절 | Open (ADR-011로 제안) |
| b | 브리프 3.1의 Drizzle과 계약의 `node:sqlite` 불일치 | ADR-002 | Accepted (ADR-002) |
| c | 브리프 3.5 엔티티(onboarding_answers, ai_providers, conversations, learning_sessions) 통합 또는 보류 | DATA_MODEL 2절 | Open |
| d | 브리프 6절은 리마인더·연속 기록 제외, 7절은 2차 포함 | ROADMAP 3절 | Open (2차로 제안) |
| e | `learning_summaries.covered_until_seq`가 DB에는 있으나 TS 타입에 없음. `messages.seq`, `background_jobs.payload_json`도 TS 타입 누락 | DATA_MODEL 12절 | **Resolved (1차 범위 결정, 2026-11-11)**. 결정: 1차 공개 계약(`src/shared/domain.ts`)에 `seq`, `payload_json`, `coveredUntilSeq`를 추가하지 않는다. 순서와 요약 경계는 저장소 내부(`repo-*.ts`)에서만 쓰며 Renderer에 노출하지 않는다. 계약에 노출하려면 리더 승인이 필요하다 (2차 후보). |
| f | AI 세션 ID와 제공사 세션 ID 구분. 현재 설계에 제공사 세션 없음 | ADR-003 | Open (명시 완료) |
| g | Node 24 `node:sqlite` 안정성과 ExperimentalWarning 미검증 | ADR-002 | Open (trade-off 기록) |
| h | Windows 패키지의 실행 검증은 Windows 호스트 필요 | MVP_SCOPE D-8 | Open |
| i | "다음 날 학습 재개"는 `currentLessonId`, `lastStudiedAt`, 요약으로 구현 | TUTOR_ENGINE 8절 | Open (설계 확정 제안) |
| j | `learning_memories.source`에 `self_report` 값 없음. self_report 근거 기억 생성 불가 | DATA_MODEL 12절 | **Resolved (1차 제외, 2026-11-11)**. 결정: 1차 기억(`learning_memories`)의 source는 `summary`와 `quiz`만 쓴다. 자기 점검 근거는 `objective_evidence`에 그대로 남으므로 목표 상태에는 영향이 없다. `self_report` 기억을 허용하려면 새 마이그레이션(v2, append-only)과 리더 승인이 필요하다 (2차 후보). |
| k | 일부 FK 누락 (`courses.current_lesson_id`, `messages.lesson_id`, `messages.reply_to`, `learning_summaries.lesson_id`, `learning_summaries.covered_until_message_id`) | DATA_MODEL 4.15 | **Resolved (1차 유지, 2026-11-11)**. 결정: 1차 마이그레이션 v1은 수정하지 않는다 (append-only). 참조 무결성은 쓰기 경로의 코스 소속 확인과 트랜잭션에 의존한다. FK 추가는 마이그레이션 v2로 2차에 리더 승인 후 진행한다. |
| l | dedupe_key 형식 | BACKGROUND_JOBS 3절 | **Resolved (2026-11-11)**. 결정: 구현 형식을 확정한다. 커리큘럼은 `curriculum:<courseId>`, 세션 요약은 `summary:<courseId>` (작업 종류 `session_summary`와 접두사가 다르다). 형식은 `src/main/learning/service.ts`의 `jobKeys`가 원천이다. |
| m | 채팅 응답과 큐 작업의 전역 슬롯 우선순위 정책 | ADR-007 | **Resolved for 1차 (2026-11-11)**. 결정: 전역 `AiSlot`(한도 1)을 채팅, 백그라운드 작업, 퀴즈 생성이 공유한다. 우선순위와 선점은 없다. 채팅은 같은 코스에서 동시에 하나만 진행된다. 2차에서 우선순위 정책을 재검토한다. PROGRESS Decisions의 "채팅은 슬롯에 포함하지 않는다"는 구현과 다르므로 정정이 필요하다. |
