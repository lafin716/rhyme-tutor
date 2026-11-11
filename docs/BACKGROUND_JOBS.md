# BACKGROUND JOBS — 영속 작업 큐

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 스키마: `background_jobs` ([DATA_MODEL.md](DATA_MODEL.md) 4.14). 구현 원천: `src/main/jobs/runner.ts`, `src/main/learning/service.ts`(`jobKeys`, `deleteCourse`), `src/main/course-gate.ts`, `src/main/ai-slot.ts`.
> 수치(테스트 개수 등)는 [PROGRESS.md](../PROGRESS.md)에서 본다.

## 1. 목적

커리큘럼 생성과 세션 요약처럼 **수 초 이상 걸리는 AI 작업**을 UI 흐름에서 분리한다. 작업 상태는 DB에 남아 앱이 꺼졌다 켜져도 복구된다.

## 2. 1차 범위

| 항목 | 상태 |
|---|---|
| 영속 큐 (`background_jobs` 테이블) | Implemented (1차 MVP) |
| 작업 종류: `curriculum_generation`, `session_summary` | Implemented (1차 MVP) |
| 우선순위 정렬 (큐 안에서만) | Implemented (1차 MVP) |
| 전역 AI 슬롯 1개 (채팅·작업·퀴즈 공유) | Implemented (1차 MVP) |
| 중복 방지 (부분 유니크 인덱스) | Implemented (1차 MVP) |
| 재시도와 백오프 | Implemented (1차 MVP) |
| 시작 시 복구 | Implemented (1차 MVP) |
| 진행 이벤트 `jobs:event` | Implemented (1차 MVP) |
| 작업 취소 (큐 항목, 진행 중 작업의 AbortSignal) | Implemented (1차 MVP) |
| 주제 삭제 중 작업 경합 처리 (삭제 게이트) | Implemented (1차 MVP, 8절) |
| `assignment`, `assessment`, `review`, `analytics` 워커 | Planned (2차) |
| 예약 실행, 주기 작업 (리마인더, 연속 기록 계산) | Planned (2차) |
| 외부 큐(Redis 등), 분산 워커 | Deferred |
| 여러 프로세스 간 작업 공유 | Deferred |

## 3. 작업 종류와 dedupe 키

| `type` | 트리거 (구현) | 우선순위 | Provider 호출 | 결과 | `dedupe_key` |
|---|---|---|---|---|---|
| `curriculum_generation` | 주제 생성 직후, 그리고 `retryCurriculum` | 10 | 예 | 커리큘럼 전체 저장, `curriculum_status = ready` | `curriculum:<courseId>` |
| `session_summary` | 단원 완료(`lessons.complete`)에서 `summary` 기준으로 새 메시지가 있을 때 | 0 | 예 | 요약·기억 저장, 진도 변경 없음 | `summary:<courseId>` |

- `dedupe_key`는 `src/main/learning/service.ts`의 `jobKeys`가 만든다. 접두사는 작업 종류명과 다르다 (`session_summary` 작업의 키는 `summary:`로 시작).
- 메시지 개수 기반 자동 요약 트리거는 구현에서 확인되지 않았다. 현재는 단원 완료 시에만 큐잉한다. "약 12개 메시지" 임계치는 2차 후보로 둔다 ([LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) 참고).
- `dedupe_key`는 `NULL`을 허용한다(DB 컬럼). 키가 없는 작업은 중복 검사를 받지 않는다. 계약 타입 `BackgroundJob.dedupeKey`는 문자열로 정의되어 있어 차이가 있다 ([DATA_MODEL.md](DATA_MODEL.md) 12절).

## 4. 실행 모델

```
enqueue(type, courseId, dedupeKey, priority)
   └─ INSERT (queued) — 활성 중복이면 기존 행을 반환
JobRunner (메인 프로세스 단일 루프, 1초 폴링 + kick)
   ├─ 가장 높은 priority, 오래된 순으로 queued 1개 선택
   ├─ AiSlot 획득 (채팅·퀴즈와 공유, 동시 AI 호출 1)
   ├─ UPDATE (running, attempts + 1, started_at)
   ├─ 핸들러 실행 (Skill + Provider)
   └─ 결과에 따라 succeeded / 재큐잉(백오프) / failed / cancelled
```

| 규칙 | 값 (구현) |
|---|---|
| 전역 AI 슬롯 | `AiSlot`, `MAX_CONCURRENT_AI_CALLS = 1`. 채팅 응답, 백그라운드 작업, 퀴즈 생성이 같은 슬롯을 쓴다. 우선순위 선점은 없다 |
| 채팅과 작업의 관계 | 채팅 중에는 작업이 슬롯을 기다린다. 작업이 실행 중이면 채팅은 슬롯을 기다린다 (`AiSlot.acquire`는 대기열 방식) |
| 최대 시도 | `max_attempts` 기본 3 (`JOB_MAX_ATTEMPTS`) |
| 백오프 | 재시도 간격 `[5초, 20초]` (`RETRY_DELAYS_MS`). 추가 상한 없음. 세 번째 시도는 두 번째 실패 후 20초 뒤 |
| 구조화 출력 재시도 | Skill 내부에서 교정 프롬프트로 최대 2회 재시도(`MAX_STRUCTURED_RETRIES = 2`) 후 `INVALID_AI_OUTPUT`. 그 뒤 작업 단위 재시도가 `max_attempts`까지 적용된다 |
| 대기 상태 | 재시도 대기 중에는 `queued`로 둔다. 대기 시각을 저장하는 계약 필드는 없다 |
| 취소 | `queued`는 `cancelled`. `running`은 AbortSignal로 Provider를 멈추고 `cancelled` (주제 삭제 사유) |

### 4.1 우선순위
- 높은 `priority`가 먼저 선택된다.
- 같은 우선순위는 `created_at` 오름차순.
- 사용자가 기다리는 `curriculum_generation`(10)이 `session_summary`(0)보다 앞선다.
- 큐 우선순위는 작업끼리만 적용된다. 채팅과의 우선순위는 두지 않는다 (DECISIONS ADR-007, 항목 m).

## 5. 실패와 복구

### 5.1 재시도
| 오류 (`ProviderError.code`) | 처리 |
|---|---|
| `PROVIDER_TIMEOUT`, `PROVIDER_FAILED`, `PROVIDER_RATE_LIMITED`, `INVALID_AI_OUTPUT` | 재시도 대상. 시도 횟수가 `max_attempts` 미만이면 백오프 후 `queued` |
| `PROVIDER_AUTH_REQUIRED`, `PROVIDER_NOT_INSTALLED`, `VALIDATION` 등 그 밖의 코드 | 재시도하지 않고 `failed` (사용자 안내) |
| `PROVIDER_CANCELLED` | `cancelled` |
| 셧다운 (`jobRunner.stop`, 사유 `shutdown`) | 중단 후 `queued`로 되돌림 (재시도 횟수는 유지) |
| 주제 삭제 (사유 `course-deleted`) | `cancelled` |

최종 `failed`:
- `curriculum_generation` → `courses.curriculum_status = failed`, `curriculum_error` 기록. 대시보드에 재시도 버튼 (`courses:retryCurriculum`).
- `session_summary` → 요약 없이 진행. 대화는 막지 않는다. 다음 단원 완료 때 다시 큐잉할 수 있다.

### 5.2 시작 시 복구
앱 시작 시 `jobRunner.start()`에서 한 번 수행한다 (`recoverOnStartup`, 하나의 트랜잭션). 복구 결과 요약은 메인에서 만들어 시작 알림으로 보내는 것이 설계이며, 알림 목록의 화면 표시는 미검증이다.

| 현재 상태 | 처리 |
|---|---|
| `background_jobs.status = running` | `queued`로 되돌림 (attempts는 유지) |
| 튜터 메시지 `status = streaming` | `error`로 변경. 알림: "응답 중 종료된 메시지를 복구했어요" |
| `courses.curriculum_status = generating`인데 활성 작업 없음 | `failed`, 사유 "앱이 종료되어 중단되었어요" |

복구는 멱등이어야 한다. 두 번 실행해도 결과가 같아야 한다.

### 5.3 중복 방지
- `uq_jobs_active_dedupe`: `dedupe_key`가 있는 `queued`/`running` 작업은 키당 하나뿐이다 (부분 유니크 인덱스).
- 이미 활성 작업이 있으면 `enqueue`는 기존 작업을 반환한다. 오류로 취급하지 않는다.
- 완료된 작업(`succeeded`, `failed`, `cancelled`)은 같은 키로 다시 큐잉할 수 있다.

## 6. 상태 모델

```
queued ──► running ──► succeeded
  │           │
  │           ├──► queued (재시도 대기, 셧다운 requeue)
  │           ├──► failed
  │           └──► cancelled (취소 요청, 주제 삭제)
  └──► cancelled
```

| 상태 | 의미 |
|---|---|
| `queued` | 대기 또는 재시도 대기 |
| `running` | 실행 중 (앱 종료 시 복구 대상) |
| `succeeded` | 완료, 결과 저장됨 |
| `failed` | 최대 시도 초과 또는 재시도하지 않는 오류 |
| `cancelled` | 사용자 취소, 프로바이더 취소, 또는 주제 삭제 |

## 7. 이벤트와 UI

| 이벤트 | 내용 |
|---|---|
| `jobs:event` | `{ type: 'job', job: BackgroundJob }` (`EVENTS.jobs`) |
| `courses:event` | 커리큘럼 생성이 성공하면 `course-updated`, 주제 삭제 시 `course-deleted`. `course-deleted`는 `src/main/ipc/handlers.ts:157`에서 emit하고 `src/renderer/src/lib/subscriptions.ts:30`에서 수신한다 |
| 대시보드 카드 | 커리큘럼 생성 중(`generating`/`pending` 또는 활성 작업)이면 불확정 스피너와 "커리큘럼을 만들고 있어요" |
| 실패 | 사유를 사람 말로 표시, 재시도 버튼 |

진행률 퍼센트는 표시하지 않는다. 모델 응답 길이를 미리 알 수 없기 때문이다.

## 8. 주제 삭제와 작업 경합 (삭제 게이트)

주제 삭제는 진행 중인 AI 작업과 경합할 수 있다. 구현은 다음 순서를 지킨다 (`LearningService.deleteCourse`).

1. **게이트 열기**: `CourseDeleteGate.begin(courseId)`를 **첫 `await` 전에** 동기로 호출한다. 이후 해당 코스에 대한 새 작업은 `assertOpen`에서 `NOT_FOUND`("코스를 찾을 수 없어요.")로 거부된다.
   - 게이트 검사를 받는 진입점: 커리큘럼 재시도, 단원 완료, 자기 점검, 퀴즈 생성, 채팅 전송, 단원 시작, 채팅 재시도.
   - 예외: 단원 선택(`lessons.select`)은 게이트를 검사하지 않는다.
2. **백그라운드 작업 차단**: `abortJobs(courseId)` → `JobRunner.abortCourse(courseId)`.
   - 코스를 차단 목록에 넣는다.
   - 현재 실행 중인 작업이 이 코스의 것이면 사유 `course-deleted`로 중단하고 종료를 기다린다.
   - 차단된 코스의 작업을 claim하면 실행하지 않고 `cancelled`로 바꾼다.
   - 재시도 백오프 중에 삭제되면 `cancelled`로 바꾼다.
   - 반환된 해제 함수는 삭제 완료(또는 실패) 후 호출된다.
3. **튜터 스트림 취소**: `orchestrator.cancel(courseId)`로 진행 중 채팅 응답을 취소하고 종료를 기다린다 (`orchestrator.settle`).
4. **퀴즈 취소**: 진행 중 퀴즈 생성의 `AbortController`를 중단하고 종료를 기다린다. 생성이 끝난 뒤 코스가 사라졌거나 중단됐으면 결과를 저장하지 않는다.
5. **DB 삭제**: 하나의 트랜잭션에서 해당 코스의 `queued`/`running` 작업을 `cancelled`로 바꾸고 `courses` 행을 삭제한다 (`FK cascade`로 하위 행 삭제). 행이 없으면 `NOT_FOUND`.
6. **정리**: `finally`에서 작업 차단 해제, `gate.end(courseId)`.

`CourseDeleteGate` 구현은 `src/main/course-gate.ts`에 있고, 삭제 중인 코스 목록(`isDeleting`)을 관리한다.

### 8.1 알려진 한계
- 삭제 게이트와 작업 차단 목록은 메인 프로세스 메모리에 있다. 앱은 단일 프로세스를 전제하므로 여러 프로세스 사이의 경합은 다루지 않는다.
- 게이트는 삭제 요청 중에만 해당 코스를 막는다. 삭제가 끝나면 코스 행은 없으므로 이후 요청은 `NOT_FOUND`로 끝난다.
- 큐 작업과 삭제 사이의 경합은 완전히 막지 않는다. 삭제 중 차단과 트랜잭션 안의 `cancelJobsForCourse`로 줄이지만, 이 잔여 경합은 수용된 항목이다 ([PROGRESS.md](../PROGRESS.md) Known Issues 참고).

## 9. 관측

- 실패 로그(`job failed`)는 작업 종류, 오류 코드, 시도 횟수, 재시도 여부만 기록한다. 작업 ID와 소요 시간은 로그에 없다. 페이로드와 결과 본문은 기록하지 않는다 ([SECURITY.md](SECURITY.md)).
- `background_jobs.last_error`에는 고정된 한국어 사용자 메시지만 저장한다. CLI stderr 원문은 저장하지 않는다 (REV-01 확인).

## 10. 2차 Planned

| 항목 | 설명 |
|---|---|
| 워커 추가 | assignment, assessment, review, analytics |
| 예약 작업 | 리마인더, 연속 기록 갱신 (로컬 시간대 기준) |
| 보관 정책 | 오래된 완료 작업 정리 (기본 90일 제안) |
| 우선순위 정책 | 채팅 응답과 백그라운드 작업 사이의 우선순위 또는 선점 도입 검토. 1차는 우선순위 없이 슬롯을 공유한다 |
| 메시지 임계치 요약 | 단원 완료 외의 요약 트리거 (LEARNING_SYSTEM 참고) |
