# SKILL SYSTEM — 학습 활동 플러그인 구조

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 원천: 계약은 `src/shared/ai-schemas.ts`. 구현은 `src/main/tutor/skills.ts`(`QUIZ_SKILL`, `completeStructured`)에 있다. 아래 인터페이스 형태는 설계 기준이며 코드 식별자와 다를 수 있다.

## 1. 목적

수업 중 학습 활동(설명, 퀴즈, 요약, 커리큘럼 생성)을 **공통 인터페이스**로 묶는다. 새 활동을 추가할 때 Orchestrator나 IPC를 크게 바꾸지 않도록 한다.

## 2. 인터페이스

```ts
interface Skill<I, O> {
  readonly id: SkillId                                   // 'explanation' | 'quiz' | ...
  buildPrompt(ctx: SkillContext, input: I): PromptPart   // 작업 지시 섹션(skill)
  parse(raw: string): O                                  // Zod 검증, 실패 시 INVALID_AI_OUTPUT
}
```

| 요소 | 규칙 |
|---|---|
| `buildPrompt` | 순수 함수. I/O 없음. PromptBuilder의 `skill` 섹션에 들어갈 텍스트만 만든다 |
| `parse` | 모델 출력에서 JSON을 추출(`extractJson`)한 뒤 Zod로 검증. 실패는 `INVALID_AI_OUTPUT` |
| `SkillContext` | 코스·단원·목표·기억 등 읽기 전용 스냅샷 |
| 상태 변경 | Skill은 DB에 쓰지 않는다. 결과를 받은 서비스가 트랜잭션으로 저장한다 |

이 분리로 Skill은 단위 테스트가 쉽고, 상태 변경 규칙(근거 기반 진도)은 서비스 계층 한 곳에 모인다.

## 3. Skill 목록

### 3.1 1차 구현 (Implemented 1차 MVP)

| Skill ID | 클래스 | 입력 | 출력 스키마 | 결과 저장 |
|---|---|---|---|---|
| `explanation` | ExplanationSkill | 현재 단원, 학습자 질문 | 자연어 텍스트 (스트리밍) | `messages` |
| `quiz` | QuizSkill | 단원, 목표 목록 | `AiQuizSchema` (스키마 1–5문항, 교사 지시 3–5문항; 응답의 문항을 모두 저장) | `quizzes` |
| `learning-summary` | LearningSummarySkill | 최근 메시지, 퀴즈 결과 | `AiSessionSummarySchema` | `learning_summaries`, `learning_memories` |
| `curriculum` | CurriculumSkill | 주제, 목표, 수준, 페이스 | `AiCurriculumSchema` | `curriculum_*`, `learning_objectives` |

`ExplanationSkill`은 구조화 출력이 아니므로 `parse`가 텍스트 정리(공백, 금칙어 필터 없음)만 한다.

### 3.2 2차 Planned

| Skill ID | 목적 | 단계 |
|---|---|---|
| `assignment` | 과제 생성, 제출 평가, 피드백 | Planned (2차) |
| `assessment` | 진단·단원·종합 평가 | Planned (2차) |
| `review` | 오답 기반 복습 세트 생성 | Planned (2차) |
| `analytics` | 학습 통계 해석 (AI 해석은 보조, 수치는 DB 계산) | Planned (2차) |
| `motivation` | 목표 점검과 격려 메시지 | Planned (2차) |

### 3.3 3차 Planned / Deferred

| Skill ID | 목적 | 상태 |
|---|---|---|
| `visualize` | 개념도, 마인드맵, 차트 생성 | Planned (3차) |
| `code-lab` | 코드 실습 문제와 채점 (샌드박스) | Deferred |
| `knowledge-qa` | 학습 자료 기반 질의응답 (RAG) | Deferred |
| 플러그인 Skill 패키지 | 외부 Skill 로드 | Deferred |

## 4. 실행 흐름

```
Orchestrator → SkillRegistry.get(id)
            → buildPrompt(ctx, input) → PromptBuilder(skill 섹션)
            → Provider.complete(req)
            → parse(raw)  ── 실패 → 재시도 규칙 (BACKGROUND_JOBS 참고)
            → 서비스 계층 저장 (TX)
```

- 1차 구현에는 `SkillRegistry`가 없다. 서비스 계층(`learning/service.ts`)이 스킬 함수를 직접 호출한다. `SkillRegistry`는 2차 검토(Planned), 런타임 동적 로드는 3차 Deferred.
- 등록되지 않은 `id` 요청은 `UNKNOWN` 계열 오류로 거부한다.

## 5. 추가 규칙

| 항목 | 규칙 |
|---|---|
| 출력 스키마 | Skill마다 Zod 스키마 1개. 스키마는 `src/shared/ai-schemas.ts`에 둔다 (계약 파일이므로 변경은 leader 승인) |
| 프롬프트 버전 | Skill 프롬프트 변경 시 `PROMPT_VERSION` 갱신 |
| 금지 | Skill이 직접 CLI를 호출하거나 DB에 쓰지 않는다 |
| 테스트 | `buildPrompt` 스냅샷 테스트, `parse` 정상·오류 픽스처 테스트 ([TEST_PLAN.md](TEST_PLAN.md)) |

## 6. 2차 이후 설계 메모
- Skill별 권한 목록(예: 기억 쓰기 허용 여부)을 선언형으로 둔다.
- 여러 Skill을 순차 실행하는 파이프라인은 2차에서 검토한다. 병렬 실행은 Deferred.
