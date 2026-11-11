# TEST PLAN — 검증 계획

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 이 문서는 **시나리오와 계획**을 정리한다. 테스트 실행 결과(통과 수, 성능 수치)는 이 문서에 적지 않는다. 최신 수치는 `PROGRESS.md`의 "Latest Integration Result"를 보라 (see PROGRESS.md). 여기서 "Implemented"는 해당 계층이 코드·테스트로 존재한다는 뜻이며, 개별 시나리오의 통과 여부는 PROGRESS를 따른다.
> 전략 원천: `docs/TEST_STRATEGY.md`. 이 문서는 시나리오와 완료 기준의 매핑을 정리한다.

## 1. 테스트 계층

| 계층 | 대상 | 도구 (예정) | 실행 명령 | 상태 |
|---|---|---|---|---|
| 정적 검사 | 타입, 린트 | TypeScript, ESLint | `npm run typecheck`, `npm run lint` | Implemented (1차 MVP) |
| 단위 | Zod 스키마, 채점, 상태 전이, Context Builder 예산, Provider 파서, 작업 큐 | Vitest | `npm test` | Implemented (1차 MVP) |
| 저장소 통합 | 마이그레이션, 트리거, 부분 유니크 인덱스, cascade | Vitest + 임시 DB | `npm test` | Implemented (1차 MVP) |
| Provider 계약 | Mock과 CLI 어댑터가 같은 `AIProvider` 계약을 따르는지 | Vitest | `npm test` | Implemented (1차 MVP) |
| 작업 큐 | 재시도, 백오프 [5s, 20s], 복구, 중복 방지 | Vitest, 주입 시계 | `npm test` | Implemented (1차 MVP) |
| E2E | 시나리오 A–F (Mock 기준) | Playwright (Electron) | `npm run test:e2e` | Implemented (1차 MVP) |
| 화면 캡처 | 해상도 3종 × 라이트/다크 캡처 | Playwright 별도 설정 | `npx playwright test -c playwright.screens.config.ts` (npm 스크립트 없음) | Implemented (1차 MVP) |
| 실 CLI 스모크 | Claude Code, Codex 실제 호출 | Vitest 게이트 | `TUTOR_REAL_CLI=1 npx vitest run tests/unit/providers/real.smoke.test.ts` | Implemented (1차 MVP) 게이트, 실행 여부는 PROGRESS 기록 |
| 실 CLI 수동 | 로그인된 환경에서 사람이 수행 | 사람 | 체크리스트 (9절) | 미검증 항목은 "미검증"으로 보고 |
| 패키징 | 빌드 산출물 생성 | electron-builder | `npm run package:mac`, `npm run package:win` | Implemented (1차 MVP). Windows 실행은 미검증 |
| 성능 측정 | 응답 시작, 메모리 | Mock 기반 계측 (`tests/perf`) | 8절 | 수치는 see PROGRESS.md |
| 2차 계층 | API Provider 계약, 대시보드 집계, 과제 채점 재현성 | — | — | Planned (2차) |
| 3차 계층 | 3D 렌더링, 음성, RAG 품질, 샌드박스 격리 | — | — | Planned (3차) / Deferred |

## 2. 시나리오와 완료 기준 매핑

| 시나리오 | 내용 | 주 계층 | 관련 MVP | 상태 |
|---|---|---|---|---|
| A | 첫 실행 → 온보딩 → 주제 생성 → 커리큘럼 완료 | E2E (Mock) | MVP-01, 02, 05, 06, 07 | E2E 스펙 존재. 통과 기록은 PROGRESS |
| B | 교실 채팅: 전송, 스트리밍, 중단, 재시도 | E2E (Mock) + 단위 | MVP-08, 11 | E2E 스펙 존재. 통과 기록은 PROGRESS |
| C | 단원 완료, 퀴즈 채점, 목표 근거 기록 | E2E (Mock) + 단위 | MVP-09, 10 | E2E 스펙 존재. 통과 기록은 PROGRESS |
| D | 앱 종료 후 재실행, "이어서 수업하기" | E2E (Mock) | MVP-12, 08 | Verified: tests/e2e/d-classroom.spec.ts |
| E | Provider 실패: 미설치, 인증, 한도, 시간 초과 | E2E (Mock 마커) | MVP-03, 04 | 마커 경로는 Mock으로 검증. 미설치 경로는 탐지 단위 테스트 기준 |
| F | 주제 삭제 후 다른 주제 보존, JSON 내보내기 | E2E + 통합 | MVP-12 | 삭제는 통합 검증. 내보내기 UI 경로는 Unverified |

> 시나리오 E2E 결과(8/8 통과 기록)는 PROGRESS.md "Latest Integration Result"를 따른다.

### 2.1 시나리오별 세부 점검

**A. 첫 실행부터 커리큘럼까지**
- 빈 DB에서 앱 실행 시 마이그레이션 1회 적용
- 온보딩 5문항 완료 후 대시보드 진입, 재실행 시 온보딩 재노출 없음
- Mock 연결 상태에서 주제 생성 → 카드 생성 → `curriculum_generation` 완료 → 모듈·단원·목표 저장
- 같은 `requestId`로 두 번 요청해도 주제 1개

**B. 채팅**
- 학습자 메시지가 `clientMessageId`로 한 번만 저장 (중복 전송 방지)
- 스트리밍 델타가 순서대로 표시, 최종 행은 `complete`
- 응답 중 전송 시 `BUSY` 응답
- 중단 시 메시지 `cancelled`, 부분 응답 보존 여부는 TUTOR_ENGINE 규칙 따름
- 실패 메시지에서 재시도 시 같은 행 재사용

**C. 진도와 퀴즈**
- 퀴즈 문항 수: `AiQuizSchema`는 1–5를 허용하고 작업 지시는 3–5를 요구한다 (불일치, LEARNING_SYSTEM §4.1). 시나리오 검증은 "문항 수가 스키마 범위 안"으로 한다.
- 저장된 `answer_index`와 비교해 채점 (AI 출력 미사용)
- 목표 `achieved`는 `objective_evidence` 행이 있을 때만 생성
- AI 응답에 완료 신호가 있어도 단원 상태 불변
- 오답 시 목표 `not_started`/`in_progress` → `needs_review`. 이미 `achieved`면 유지 (LEARNING_SYSTEM §3.1)

**D. 재개**
- 앱 종료 중 `streaming` 메시지 → 재실행 시 `error` + 안내 문구
- 실행 중 `running` 작업 → `queued`로 복구
- `last_studied_at` 최신 주제의 현재 단원으로 이동

**E. 실패 주입**
- `[[mock:fail]]` → `PROVIDER_FAILED`, 재시도 버튼 동작
- `[[mock:auth]]` → `PROVIDER_AUTH_REQUIRED`, 재시도 안 함
- `[[mock:ratelimit]]` → `PROVIDER_RATE_LIMITED`, 백오프 후 재시도
- `[[mock:invalid]]` → 교정 재시도 2회 후 `INVALID_AI_OUTPUT`
- `[[mock:slow]]` → 제한 시간 초과 시 `PROVIDER_TIMEOUT`, 취소 시 `PROVIDER_CANCELLED`
- CLI 미설치: 탐지 결과 `PROVIDER_NOT_INSTALLED` 안내

**F. 삭제와 내보내기**
- 주제 A 삭제 시 주제 B의 메시지, 퀴즈, 기억이 그대로 남음
- 삭제 후 `background_jobs` 해당 행 제거, 활성 작업 취소
- JSON 내보내기에 API 키, CLI 자격 증명 문자열이 없음 (S-5)

## 3. 단위 테스트 항목 (예정)

| 대상 | 주요 케이스 |
|---|---|
| Zod 스키마 | 길이 상한, 빈 문자열, `UpdateCourseInputSchema`에 title·topic_prompt 포함 시 거부 (strict) |
| 채점 | 정답·오답·미응답, 저장 키 기준 |
| 상태 전이 | 목표 `not_started → in_progress → achieved / needs_review`, 근거 없는 `achieved` 거부 |
| Context Builder | 예산 12,000자 초과 시 최신순 절삭, 요약 경계 이후만 포함, 기억 10개 상한, evidence 우선 |
| PromptBuilder | 섹션 순서 (core, character, learner, course, lesson, memory, skill), `PROMPT_VERSION` 기록 |
| Provider 파서 | Claude stream-json, Codex JSON 이벤트, 미지 이벤트 무시, 잘못된 줄 무시 |
| 백오프 | 재시도 지연 [5초, 20초], 상한 없음 (RETRY_CAP_MS 제거됨), 최대 시도 3. 재시도 대상은 `PROVIDER_TIMEOUT`, `PROVIDER_FAILED`, `PROVIDER_RATE_LIMITED`, `INVALID_AI_OUTPUT` |
| 중복 키 | 활성 중복 시 기존 ID 반환, 완료 후 재큐잉 허용 |

## 4. 저장소 통합 테스트 항목 (예정)

| 항목 | 기대 |
|---|---|
| 마이그레이션 v1 | 모든 테이블과 인덱스 생성, 두 번째 실행 no-op |
| `courses_immutable_identity` 트리거 | `id`, `request_id`, `title`, `topic_prompt`, `created_at` 변경 시 `COURSE_IMMUTABLE` |
| `uq_jobs_active_dedupe` | 같은 키의 `queued`/`running` 두 번째 삽입 실패 |
| `messages` 유니크 | `(course_id, client_message_id)` 중복 실패 |
| cascade 삭제 | 주제 삭제 시 하위 행 모두 제거, 다른 주제 불변 |
| `PRAGMA foreign_keys` | 연결마다 ON 확인 |

## 5. Provider 계약 테스트 (예정)

- Mock, Claude 어댑터, Codex 어댑터 모두 `detect()`와 `complete()`를 같은 케이스 표로 검사
- 공통 케이스: 성공, 스트리밍 델타 순서, `AbortSignal` 취소, 타임아웃, 오류 코드 매핑
- CLI 실행 테스트는 실제 CLI 대신 **가짜 실행 파일**(고정 출력 스크립트)을 사용해 자동화한다. 실제 CLI는 9절 수동 점검에서만 사용.
- 인자 검사: `shell: false`, 사용자 텍스트가 인자 배열에 들어가지 않음

## 6. E2E 전략

| 항목 | 방침 |
|---|---|
| 기본 Provider | Mock. 실패 마커를 쓰려면 `TUTOR_ENABLE_MOCK=1`, 지연 `TUTOR_MOCK_DELAY_MS` 기본 15ms |
| 데이터 격리 | `TUTOR_USER_DATA_DIR`를 테스트마다 임시 디렉터리로 지정 |

**환경 변수 정리**

| 변수 | 값 | 용도 |
|---|---|---|
| `TUTOR_ENABLE_MOCK` | `1` | Mock 실패 마커(`[[mock:*]]`) 해석 허용. Mock 자체는 항상 목록에 있다 |
| `TUTOR_MOCK_DELAY_MS` | 정수 ms (기본 15) | Mock 청크 지연. `slow` 마커는 40청크 × 250ms로 고정 |
| `TUTOR_USER_DATA_DIR` | 경로 | userData 대체 (테스트 격리) |
| `TUTOR_REAL_CLI` | `1` | 실 CLI 스모크 테스트 게이트 |

CI와 E2E 기본 경로에서 `TUTOR_REAL_CLI`는 설정하지 않는다.
| 시계 | 백오프 테스트는 짧은 상수 또는 주입 시계 사용 |
| 실 CLI 사용 | E2E에서 사용하지 않음 (CI 인증 정보 없음, 비용 발생 방지) |
| 실패 방식 | 스크린샷과 로그 경로를 리포트에 첨부 (로그에 본문 없음 확인) |

## 7. 보안 검증 (SECURITY 10절과 연결)

| 점검 | 방법 | 상태 |
|---|---|---|
| `shell: true` 부재 | 정적 검색 | Planned (검증 시점 실행) |
| Renderer의 `electron`, `node:*` import 부재 | ESLint 규칙 | Implemented (1차 MVP) 목표 |
| 자격 증명 경로 접근 부재 | 코드 검색 | Planned (검증 시점 실행) |
| 내보내기 비밀 값 부재 | E2E 시나리오 F 중 파일 검사 | Implemented (1차 MVP) 목표 |
| 패키지 내용 점검 | 패키지 산출물 목록 확인 | Planned (검증 시점 실행) |

## 8. 성능 측정 (정의만, 수치 주장 없음)

| 지표 | 측정 방법 | 목표 (1차 기준) |
|---|---|---|
| 앱 콜드 스타트 → 대시보드 표시 | 시작 시각 로그와 첫 렌더 시각 | 목표값은 측정 후 PRD 수용 기준과 비교 |
| 채팅 첫 델타 도착 (Mock) | 전송 시각과 첫 델타 시각 차이 | Mock 기준 상한 설정 후 측정 |
| 채팅 첫 델타 도착 (실 CLI) | 동일, CLI 종류별 기록 | 참고치만 기록, 보장 값 아님 |
| 메모리 사용량 (30분 교실 사용) | OS 도구로 RSS 기록 | 측정 후 상한 설정 |
| Context Builder 조립 시간 | 단위 계측 | 예산 내 밀리초 단위 |

측정 결과는 측정 환경(OS, 기기, Node 버전, Provider)과 함께 `PROGRESS.md`에 기록한다. 이 문서에는 수치를 적지 않는다 (see PROGRESS.md). 측정하지 않은 값은 기록하지 않는다.

## 9. 실 CLI 수동 점검 체크리스트

| # | 항목 | 결과 기록 |
|---|---|---|
| M-0 | 실 CLI 스모크 자동 게이트: `TUTOR_REAL_CLI=1 npx vitest run tests/unit/providers/real.smoke.test.ts` | PROGRESS 기록 |
| M-1 | Claude Code 미설치 상태에서 "미설치" 안내 | 실행 여부와 결과 |
| M-2 | Claude Code 설치, 미로그인 상태에서 "로그인 필요" 안내 | 실행 여부와 결과 |
| M-3 | 로그인 후 "연결됨" 표시, 테스트 요청 성공 | 실행 여부와 결과 |
| M-4 | Codex 동일 절차 (M-1 ~ M-3) | 실행 여부와 결과 |
| M-5 | 실제 CLI로 커리큘럼 1회 생성 | 실행 여부와 결과 |
| M-6 | 실제 CLI로 채팅 스트리밍과 중단 | 실행 여부와 결과 |
| M-7 | 학습 내용이 로그에 없는지 확인 | 실행 여부와 결과 |

수동 점검 결과가 없으면 "미검증"으로 보고한다. 이 문서에서 결과를 대신 적지 않는다.

## 10. 2차 / 3차 테스트 (Planned)

| 단계 | 항목 |
|---|---|
| 2차 | API Provider 계약 테스트, 대시보드 집계 검증, 과제 채점 재현성 (같은 입력 반복 실행), 리마인더 시간대 테스트 |
| 3차 | 3D 캐릭터 프레임 안정성, 음성 지연 측정, RAG 검색 품질 기준, 샌드박스 격리 침투 점검 |

## 11. 종료 기준

1차 종료는 MVP_SCOPE 5절의 D-1 ~ D-10 상태를 모두 기록한 뒤에만 선언한다. 미실행 항목은 사유와 함께 남긴다.
