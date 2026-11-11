# PRD — Rhyme Tutor

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 기능 요구사항은 원본 브리프(제품 명세) 기준이며, 기술 세부는 각 상세 문서를 따른다.

## 1. 기능 목록 (전체)

| ID | 기능 | 단계 | 상태 | 상세 |
|---|---|---|---|---|
| F-01 | 앱 초기화 (Electron, SQLite, 마이그레이션, 설정, 로깅) | 1차 | Implemented (1차 MVP) | [ARCHITECTURE.md](ARCHITECTURE.md), [DATA_MODEL.md](DATA_MODEL.md) |
| F-02 | 최초 온보딩 (학습 성향 5문항) | 1차 | Implemented (1차 MVP) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| F-03 | AI Provider 탐지·연결 (Claude Code, Codex) | 1차 | Implemented (1차 MVP, experimental 어댑터) | [AI_PROVIDER.md](AI_PROVIDER.md) |
| F-04 | Mock Provider (테스트·체험, 실패 주입) | 1차 | Implemented (1차 MVP) | [AI_PROVIDER.md](AI_PROVIDER.md) |
| F-05 | 메인 대시보드 (카드형 주제 목록, 이어서 학습) | 1차 | Implemented (1차 MVP). "이어서 수업하기" 버튼 Verified (E2E) | [UI_UX.md](UI_UX.md) |
| F-06 | 학습 주제 생성 (자연어 입력, 목표·수준·페이스, 멱등 생성) | 1차 | Implemented (1차 MVP) | [DATA_MODEL.md](DATA_MODEL.md) |
| F-07 | 주제 불변성 (이름·식별자·원문 수정 불가) | 1차 | Implemented (1차 MVP) | [DATA_MODEL.md](DATA_MODEL.md) |
| F-08 | 전담 AI 선생님 생성 (프리셋 4종, 구조화 저장) | 1차 | Implemented (1차 MVP) | [CHARACTER_SYSTEM.md](CHARACTER_SYSTEM.md) |
| F-09 | 커리큘럼 자동 생성 (Course→Module→Lesson→Objective, 백그라운드) | 1차 | Implemented (1차 MVP) | [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) |
| F-10 | 수업 채팅 (스트리밍, 취소, 재시도, 복원) | 1차 | Implemented (1차 MVP) | [TUTOR_ENGINE.md](TUTOR_ENGINE.md) |
| F-11 | 단원 진도 관리 (명시적 완료, 근거 기반 목표 달성) | 1차 | Implemented (1차 MVP) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| F-12 | 퀴즈 (객관식·OX, 저장된 정답으로 채점, 해설, 신고) | 1차 | Implemented (1차 MVP) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| F-13 | 세션 요약 및 학습 기억, Context Builder | 1차 | Implemented (1차 MVP) | [TUTOR_ENGINE.md](TUTOR_ENGINE.md) |
| F-14 | 최소 백그라운드 작업 큐 (영속 상태, 복구, 동시성 제한) | 1차 | Implemented (1차 MVP) | [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) |
| F-15 | 설정 (Provider, 성향 재확인, 테마, 데이터 경로, 주제 삭제, JSON 내보내기) | 1차 | Implemented (1차 MVP). JSON 내보내기 UI 경로는 Unverified | [UI_UX.md](UI_UX.md) |
| F-16 | 적응형 학습 프로필 (행동 기반 성향 조정) | 2차 | Planned (2차) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| F-17 | 과제 시스템 (생성·제출·채점·피드백·이력) | 2차 | Planned (2차) | [SKILL_SYSTEM.md](SKILL_SYSTEM.md) |
| F-18 | 진단·단원·종합 평가 (AssessmentSkill) | 2차 | Planned (2차) | [SKILL_SYSTEM.md](SKILL_SYSTEM.md) |
| F-19 | 복습 시스템 (오답 노트, 간격 반복, 취약 개념) | 2차 | Planned (2차) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| F-20 | 커리큘럼 재구성 (학습 결과 반영) | 2차 | Planned (2차) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| F-21 | 공식 API Provider (Anthropic API, OpenAI API) | 2차 | Planned (2차) | [AI_PROVIDER.md](AI_PROVIDER.md) |
| F-22 | 학습 대시보드 (주간 시간, 달성률, 숙련도 변화, 오답 통계) | 2차 | Planned (2차) | [ROADMAP.md](ROADMAP.md) |
| F-23 | 동기부여 (목표, 리마인더, 연속 기록, 복귀 모드) | 2차 | Planned (2차) | [ROADMAP.md](ROADMAP.md) |
| F-24 | 추가 워커 (Assignment, Assessment, Review, Analytics) | 2차 | Planned (2차) | [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) |
| F-25 | 캐릭터 고도화 (Live2D/VRM, 감정 모션, 외형 커스터마이징) | 3차 | Planned (3차) | [CHARACTER_SYSTEM.md](CHARACTER_SYSTEM.md) |
| F-26 | 음성 (STT, TTS, 음성 채팅, 발음 분석, 립싱크) | 3차 | Planned (3차) | [CHARACTER_SYSTEM.md](CHARACTER_SYSTEM.md) |
| F-27 | 학습 자료 지식베이스 (PDF, TXT, MD, 웹, 코드, Git) | 3차 | Deferred | [ROADMAP.md](ROADMAP.md) |
| F-28 | 코드 실습 샌드박스 | 3차 | Deferred | [SECURITY.md](SECURITY.md) |
| F-29 | 시각화 (개념도, 차트, 마인드맵) | 3차 | Planned (3차) | [SKILL_SYSTEM.md](SKILL_SYSTEM.md) |
| F-30 | 주제 복제·분기 (course clone/branch) | 3차 | Deferred | [DATA_MODEL.md](DATA_MODEL.md) |
| F-31 | 다국어 (i18n) | 3차 | Deferred | [UI_UX.md](UI_UX.md) |
| F-32 | 플러그인 / 스킬 패키지 / 콘텐츠 패키지 | 3차 | Deferred | [SKILL_SYSTEM.md](SKILL_SYSTEM.md) |
| F-33 | 선택적 클라우드 동기화, 계정, 결제, 마켓플레이스 | 3차 | Deferred | [ROADMAP.md](ROADMAP.md) |

## 2. 기능별 상세 요구사항

### F-02 최초 온보딩
- 최초 실행 여부는 `user_profile` 행 존재로 판단한다 (`id = 1` 싱글턴).
- 5문항(시작 어려움, 학습 방법, 관리 방식, 하루 학습 시간, 동기 방식). 선택지 원문은 `src/shared/onboarding.ts`.
- 이전/다음 이동, 진행률 표시, 완료 시 메인 대시보드로 이동.
- 응답은 `profile.save`로 로컬 저장. 설정에서 재확인·수정 가능.
- 응답은 "현재 상황"이지 고정 성격이 아니다. "게으르다" 같은 선택을 영구 라벨로 쓰지 않는다.
- **수락 기준**: 재시작 후 설문이 다시 나타나지 않는다 (시나리오 A).

### F-03 AI Provider 연결
- Claude Code, Codex 탐지: 설치 여부, 실행 파일 경로, 버전, 로그인 상태(공식 상태 명령 기반).
- 사용자가 기본 Provider를 선택하고 "테스트 요청"으로 실제 응답을 확인.
- 인증 필요, 미설치, 사용량 제한, 시간 초과, 실행 오류를 구분해 한국어로 안내.
- API 키 입력을 요구하지 않는다.
- Provider 변경은 `settings.activeProvider`만 바꾸며 학습 데이터는 변경하지 않는다.
- 상세와 정책은 [AI_PROVIDER.md](AI_PROVIDER.md).

### F-06 / F-07 학습 주제 생성과 불변성
- 입력: 주제명(`title`, 1–60자), 원문 요청(`topicPrompt`, 2–500자), 목표(`goal`), 수준(`level`), 페이스(`pace`), 캐릭터 프리셋, 선택적 선생님 이름(≤20자), 클라이언트 `requestId`(UUID).
- `requestId`가 같으면 같은 코스를 돌려준다. 더블 클릭·재전송으로 중복 생성되지 않는다 (시나리오 C, 동시성 기준).
- 생성 시 코스·선생님·커리큘럼 작업을 한 트랜잭션으로 저장한다.
- 불변: `id`, `request_id`, `title`, `topic_prompt`, `created_at`. 수정 가능: `goal`, `level`, `pace`.
- 불변성은 (1) 스키마 `UpdateCourseInputSchema`에서 필드 제외, (2) 저장소 검증, (3) SQLite 트리거 `courses_immutable_identity`로 3중 보장.
- AI가 주제를 해석해 짧은 추가 질문을 하는 기능은 **Planned (2차)**. 1차는 폼 입력으로 대체하고 AI는 커리큘럼 작업에서 목표를 해석한다.

### F-08 선생님 생성
- 프리셋 4종: 하린(친절한 설명형), 도윤(엄격한 과제형), 하루(동기부여 코치형), 이안(연구자·탐구형). 값은 `src/shared/presets.ts`.
- 선택한 프리셋의 성격·말투·교수법을 `tutor_characters`에 구조화 저장하고, 수업 프롬프트의 `character` 섹션에 주입한다.
- `approach`(학습자 접근 방식)는 온보딩 응답에서 생성 시 한 번 파생해 저장한다.
- 이미지 생성 API, 외부 에셋은 사용하지 않는다. 2D SVG는 코드로 그린다.

### F-09 커리큘럼
- 출력은 JSON이며 `AiCurriculumSchema`(Zod)로 검증. 모듈 1–8개, 모듈당 단원 1–6개, 단원당 목표 1–5개.
- 무효 응답은 교정 힌트와 함께 최대 2회 재시도 후 `INVALID_AI_OUTPUT`.
- 실패 시 `curriculum_status = failed`, `curriculum_error` 저장, 대시보드·교실에서 재시도 버튼 표시 (시나리오 F).
- 생성 결과는 한 트랜잭션으로 모듈·단원·목표를 삽입한다. 부분 저장 없음.

### F-10 수업 채팅
- 주제별 독립 대화. 학습자 메시지 저장, 선생님 응답 스트리밍, 취소, 재시도(같은 행 재사용).
- 선생님은 먼저 제안한다: 수업 시작(`startLesson`), 설명 후 이해 확인, 다음 단원 제안.
- 앱 재시작 후 같은 메시지 목록과 현재 단원 복원.
- 사용자 메시지는 AI 실패와 무관하게 보존한다.

### F-11 진도
- 단원 상태: `not_started`, `in_progress`, `completed`, `needs_review`.
- 목표 상태: `not_started`, `in_progress`, `achieved`, `needs_review`.
- 목표는 근거(`objective_evidence`) 없이 `achieved`가 될 수 없다. AI는 진도를 직접 바꾸지 않는다.
- 단원 완료는 학습자의 명시적 행동(`lessons.complete`)으로만 한다.

### F-12 퀴즈
- 1회 생성 3–5문항(객관식 또는 OX). 스키마(`AiQuizSchema`)는 1–5문항을 허용하고 교사 지시는 3–5문항이다 ([LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) 4.1). 정답 키 비노출 여부는 조회 경로별로 확인이 필요하다.
- 채점은 저장된 `answer_index`와 비교하여 main이 수행한다. AI 채팅 응답으로 정답을 판정하지 않는다.
- 결과 화면에 정답·해설 표시, `quiz_attempts` 저장, 목표 근거 기록.
- 문제 신고(`quiz.flag`): 사유 기록, 플래그 표시. 해당 문제를 자동 제외하는 정책은 [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) 참고.

### F-13 요약과 기억
- 단원 완료(`lessons.complete`) 때 요약 이후 새 메시지가 있으면 `session_summary` 작업을 만든다. 약 12개 메시지 임계치 트리거는 구현되지 않았고 2차 후보다 ([BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) 3절).
- 요약은 `learning_summaries`에, 강점·어려움은 `learning_memories`에 저장. 각 기억은 `confidence`(`evidence` / `ai_inferred`)를 가진다.
- Context Builder는 전체 대화를 재전송하지 않는다 ([TUTOR_ENGINE.md](TUTOR_ENGINE.md)).

### F-15 설정과 데이터
- 설정 항목: AI Provider, 모델 별칭(선택), 요청 제한 시간(30–900초), 학습 성향 재확인, 테마(system/light/dark).
- 데이터 위치 열기, JSON 내보내기(네이티브 저장 대화상자).
- 주제 삭제: 확인 대화상자 후 해당 주제의 모든 학습 데이터를 cascade 삭제. 되돌릴 수 없음을 명시한다. (브리프의 "학습 기록 유지"는 *다른 주제의 기록을 보존한다*는 뜻으로 해석, [MVP_SCOPE.md](MVP_SCOPE.md) 참고)

## 3. 대표 사용자 시나리오

| 시나리오 | 흐름 | 검증 |
|---|---|---|
| 첫 실행 | 온보딩 → 연결(Mock 또는 CLI) → 빈 대시보드 → 주제 생성 | A, B, C |
| 수업 | 주제 카드 → 교실 → 선생님 인사 → 질문 → 답변 저장 → 단원 완료 | D |
| 퀴즈 | 퀴즈 생성 → 답변 → 채점 → 해설 → 근거 기록 | E |
| 장애 | CLI 인증 만료 → 오류 표시 → 메시지 보존 → 재시도 또는 Provider 변경 | F |
| 다음 날 재개 | 앱 재실행 → 대시보드 "이어서 수업하기" → 마지막 단원 | D (재시작) |

## 4. 우선순위

| 우선순위 | 항목 |
|---|---|
| P0 | 성공 흐름 전체, 데이터 무결성, 재시작 복원, 장애 시 메시지 보존 |
| P1 | Provider 탐지·연결 안내, 퀴즈 채점, 요약·맥락 복원 |
| P2 | 캐릭터 애니메이션 세부, 내보내기 편의 기능 |
| 이후 | 2차·3차 항목 (ROADMAP) |

## 5. 단계별 기능 분류

- **1차 (MVP)**: MVP-01 ~ MVP-12. 상세 체크리스트는 [MVP_SCOPE.md](MVP_SCOPE.md).
- **2차 (Planned)**: 학습 엔진 고도화, 과제·평가·복습, 학습 대시보드, 동기부여, 제한된 워커, API Provider.
- **3차 (Planned / Deferred)**: 실감형 캐릭터, 음성, 지식베이스, 코드 실습, 시각화, 플러그인, 클라우드, i18n.

단계 간 의존성과 전환 기준은 [ROADMAP.md](ROADMAP.md).
