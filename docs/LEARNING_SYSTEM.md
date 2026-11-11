# LEARNING SYSTEM — 성향, 커리큘럼, 진도, 퀴즈, 기억

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 상태 전이 표 원천: [DATA_MODEL.md](DATA_MODEL.md) 6절.

## 1. 학습 성향 (온보딩)

### 1.1 설문 (Implemented 1차)

5문항, 선택형. 문항과 선택지 원문은 `src/shared/onboarding.ts`가 원천이다.

| # | 주제 (의도) | 목적 |
|---|---|---|
| Q1 | 시작을 어려워하는 정도 | 첫 단원 크기와 시작 제안 방식 |
| Q2 | 선호하는 학습 방법 | 설명·예시·퀴즈 비율 |
| Q3 | 관리 방식 | 다음 행동 제안의 구체성 |
| Q4 | 하루 학습 가능 시간 | 단원 분량, 페이스 기본값 |
| Q5 | 동기 부여 방식 | 선생님 격려 톤 |

수준 라벨: 입문 / 중급 / 고급. 페이스 라벨: 천천히 / 보통 / 빠르게.

### 1.2 해석 원칙
- 설문 응답은 **현재 상황**이며 고정된 성격이 아니다. 화면이나 프롬프트에 "게으른 사용자" 같은 라벨을 쓰지 않는다.
- 응답은 `user_profile.answers_json`에 저장하고, 프롬프트에는 `learner` 섹션으로 요약해 넣는다.
- 설정에서 언제든 재확인할 수 있으며, 변경은 이후 생성되는 주제와 프롬프트에 반영된다. 이미 만든 주제의 선생님 설정은 바뀌지 않는다.

### 1.3 적응형 프로필 (2차 Planned)
- 실제 학습 행동(완료율, 오답 빈도, 세션 길이)을 근거로 기본값을 조정한다.
- 조정 내역은 사용자에게 보이고, 거부할 수 있어야 한다.
- 1차에는 자동 조정이 없다.

## 2. 학습 주제와 커리큘럼

### 2.1 주제 생성 (Implemented 1차)
- 입력은 폼이다: 주제명, 원문 요청, 목표, 수준, 페이스, 선생님 프리셋.
- 생성은 멱등이다 (`requestId`).
- 주제 식별자와 원문(`title`, `topic_prompt`)은 생성 후 변경할 수 없다. 목표, 수준, 페이스는 변경 가능하다.

### 2.2 AI 주제 분석과 명확화 질문 (2차 Planned)
브리프의 "AI가 주제를 분석해 짧은 확인 질문을 한다" 흐름은 1차에 없다. 1차는 폼으로 대체하고, AI는 커리큘럼 생성 단계에서 목표를 해석한다. 명확화 질문은 2차 항목이다 ([DECISIONS.md](DECISIONS.md) 참고).

### 2.3 커리큘럼 구조 (Implemented 1차)

```
Course (주제)
 └─ Module (모듈) 1–8개
     └─ Lesson (단원) 1–6개 / 모듈
         └─ Objective (목표) 1–5개 / 단원
```

| 항목 | 규칙 |
|---|---|
| 생성 | `curriculum_generation` 백그라운드 작업. 출력은 `AiCurriculumSchema` JSON |
| 검증 | Zod 검증 실패 시 교정 힌트를 담아 최대 2회 재시도 후 `INVALID_AI_OUTPUT` |
| 저장 | 한 트랜잭션. 부분 저장 없음 |
| 실패 | `curriculum_status = failed`, `curriculum_error`에 사용자용 사유 |
| 재시도 | 실패한 커리큘럼만 재생성. 기존 `ready` 커리큘럼은 건드리지 않음 |
| 첫 단원 | 생성 후 첫 단원이 `current_lesson_id`로 지정 |

### 2.4 커리큘럼 재구성 (2차 Planned)
학습 결과(목표 달성, 반복 오답)를 반영해 단원 순서를 바꾸거나 단원을 추가한다. 1차는 재구성이 없다. 재구성 시에도 이미 `achieved`인 목표는 유지하며 사용자 확인을 거친다.

## 3. 진도 모델

### 3.1 근거 기반 원칙 (Implemented 1차)

> AI는 진도를 직접 바꾸지 않는다. 목표가 `achieved`가 되려면 근거 행이 있어야 한다.

| 근거 종류 (`objective_evidence.kind`) | 생성 경로 | 목표 상태 변화 (`LearningService`, 코드 기준) |
|---|---|---|
| `quiz` 정답 | `answerQuiz`: 저장된 `answer_index`와 비교 | `achieved`가 아니면 → `achieved` (`needs_review`도 포함) |
| `quiz` 오답 | 같은 경로 | `not_started`/`in_progress` → `needs_review`. 이미 `achieved` 또는 `needs_review`면 상태 유지 |
| `self_report` | `selfCheck`: "이해했어요" → `achieved`, "다시 볼게요" → `needs_review` | 현재 상태와 관계없이 적용 (선행 상태 검사 없음) |

- 상태 변경 행과 근거 행은 **같은 트랜잭션**(`setObjectiveWithEvidence`)에서만 쓴다. 근거 행 없이 목표 상태를 바꾸는 경로는 없다.
- 상태가 바뀌지 않는 경우 (예: 이미 `achieved`인 목표에 정답) 근거 행도 추가하지 않는다.
- `self_report`는 자기 평가이므로 UI에 "스스로 표시" 배지를 붙인다 (배지 UI는 Unverified). 퀴즈 근거와 구분된다.

### 3.2 단원 완료 (Implemented 1차)
- 단원 완료는 학습자가 `lessons:complete`(`completeLesson`)를 호출할 때만 발생한다. AI는 완료를 제안할 뿐 실행하지 않는다.
- 완료 전 목표가 모두 `achieved`일 필요는 없다. 서비스는 목표 상태로 완료를 막지 않는다.
- 완료 시 같은 트랜잭션에서 다음 미완료 단원을 현재 단원으로 지정한다. 마지막 요약 이후 새 메시지가 있을 때만 `session_summary` 작업을 큐잉한다 (`summary:<courseId>` 중복 방지 키). 확인 대화상자의 "아직 확인된 목표가 없어요" 안내는 Unverified (renderer 확인 필요).

### 3.3 진도 표시 (Implemented 1차)
| 표시 | 계산 |
|---|---|
| 단원 진도 | `completed` 단원 수 / 전체 단원 수 |
| 목표 달성 | `achieved` 목표 수 / 전체 목표 수 (근거 있는 것만) |
| 최근 학습 | `courses.last_studied_at` |

### 3.4 2차 Planned
- 주간 학습 시간, 숙련도 변화 추이 (학습 대시보드, [ROADMAP.md](ROADMAP.md))
- 간격 반복에 따른 복습 스케줄

## 4. 퀴즈

### 4.1 생성 (Implemented 1차)
| 항목 | 규칙 |
|---|---|
| 개수 | `AiQuizSchema`는 1–5문항을 허용한다. `QUIZ_SKILL`의 작업 지시는 3–5문항을 요구한다. **불일치**: 문서·테스트 일부의 "3문항" 표기는 폐기하고, 실제 개수는 AI 출력에 따른다 (확인 필요, [PROGRESS.md](../PROGRESS.md) 참고) |
| 유형 | `multiple_choice` (보기 3–5개, `answerIndex`) 또는 `ox` (`O`/`X`) |
| 대상 | 현재 단원의 목표 중 하나 이상 (`objectiveIndex`, 없으면 null) |
| 검증 | `AiQuizSchema`. 정답 인덱스 범위 검사, OX 값 검사. 구조화 출력 재시도 2회 후 `INVALID_AI_OUTPUT` |
| 생성 조건 | 전역 AI 슬롯이 비어 있고 대기열도 없으며, 같은 코스에 채팅이 진행 중이 아닐 때만 시작. 아니면 `BUSY` |
| 저장 | `quizzes` (정답 키 포함, 생성 시 한 트랜잭션). 응답 DTO에서 정답 키를 빼는 규칙은 `ipc.ts`·`domain.ts` 타입으로 확인 |

### 4.2 응답과 채점 (Implemented 1차)
1. 학습자가 보기 선택 → `quiz.answer`.
2. main이 저장된 `answer_index`와 비교해 채점. **AI 응답으로 정답을 판정하지 않는다.**
3. `quiz_attempts` 삽입 (같은 트랜잭션). 연결된 목표는 §3.1 표에 따라 바뀌며, 바뀔 때만 `quiz` 근거를 남긴다.
4. 오답이면 해설과 함께 연결 목표를 `needs_review`로 바꿀 수 있다 (이미 `achieved`면 유지).
5. 해설은 저장된 `explanation`을 표시한다. 선생님의 추가 설명은 채팅으로 이어진다.

### 4.3 문제 신고 (Implemented 1차)
- `quiz.flag`로 사유(짧은 텍스트)를 남기면 `flagged = 1`.
- 신고된 문제는 목록에 경고 표시. 자동 제외는 하지 않는다 (1차). 신고 누적 기준 자동 제외는 2차.

### 4.4 2차 Planned
- 진단 퀴즈, 단원 종합 평가 ([SKILL_SYSTEM.md](SKILL_SYSTEM.md) AssessmentSkill)
- 문항 난이도 보정

## 5. 학습 기억

### 5.1 종류와 신뢰도 (Implemented 1차)

| `kind` | 의미 | 예 |
|---|---|---|
| `strength` | 잘 이해한 영역 | "변수 선언 개념을 퀴즈로 확인함" |
| `difficulty` | 어려워한 영역 | "비동기 흐름에서 두 번 연속 오답" |
| `note` | 선생님 메모 | "예시를 표로 설명하면 반응이 좋았음" |

`kind`의 세 값은 `learning_memories` 마이그레이션 정의 기준이다. 예시 문구는 설명용이며 실제 저장 문구와 다를 수 있다.

| `source` (DB 컬럼) | 신뢰도 (`confidence`) | 생성 근거 |
|---|---|---|
| `quiz` | `evidence` | 퀴즈 채점 결과 |
| `summary` | `ai_inferred` | 세션 요약 작업의 AI 판단 (대화 내용 기반) |

`self_report`는 1차에서 기억의 `source`로 쓰지 않는다 (DECISIONS open item j). 자기 점검은 목표 근거(`objective_evidence`)에만 남는다.

### 5.2 사용 규칙
- Context Builder는 최대 10개를 넣는다. `evidence`를 먼저 고른다.
- 프롬프트에서 `ai_inferred`는 "추정"으로 표시해 선생님이 단정하지 않도록 한다.
- 학습자가 기억을 개별 삭제하는 UI는 **Planned (2차)**. 1차에서 기억은 코스 삭제 시 함께 지워진다.

## 6. 학습 상태 정리

| 상태 | 대상 | 값 |
|---|---|---|
| 단원 | `curriculum_lessons.status` | `not_started`, `in_progress`, `completed`, `needs_review` |
| 목표 | `learning_objectives.status` | `not_started`, `in_progress`, `achieved`, `needs_review` |
| 커리큘럼 생성 | `courses.curriculum_status` | `pending`, `generating`, `ready`, `failed` |

`needs_review`는 "다시 보기 권장"이며 실패 표시가 아니다. 문구는 "복습 추천"을 사용한다.

## 7. 2차 / 3차 예정 요약

| 항목 | 단계 | 상태 |
|---|---|---|
| 적응형 학습 프로필 | 2차 | Planned (2차) |
| 과제 제출·채점·피드백 | 2차 | Planned (2차) |
| 복습 시스템 (오답 노트, 간격 반복) | 2차 | Planned (2차) |
| 커리큘럼 재구성 | 2차 | Planned (2차) |
| 학습 대시보드 | 2차 | Planned (2차) |
| 지식베이스 기반 학습 | 3차 | Deferred |
| 학습 기록 내보내기 가져오기 | 3차 | Deferred |
