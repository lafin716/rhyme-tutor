# PRODUCT VISION — Rhyme Tutor

> 상태 표기: **Implemented (1차 MVP)** = 1차 구현 목표 범위 · **Planned (2차 / 3차)** = 설계만 확정, 코드 없음 · **Deferred** = 일정 미정
> 이 문서의 "Implemented"는 1차 구현 *목표*이며, 실제 검증 결과는 [MVP_SCOPE.md](MVP_SCOPE.md)와 `PROGRESS.md`에서 관리한다.

## 1. 제품 정체성

| 항목 | 내용 |
|---|---|
| 제품명(가칭) | Rhyme Tutor |
| 슬로건 | "나를 기억하고, 나에게 맞춰 가르치는 나만의 AI 선생님" |
| 형태 | Local-first 데스크톱 앱 (Electron). 별도 서버 없음 |
| AI 엔진 | 사용자 PC에 설치·로그인된 Claude Code CLI / Codex CLI (1차), 공식 API Provider (2차 Planned) |
| 기본 언어 | 한국어 (다국어는 3차 Planned) |

**한 줄 정의**: 학습 주제마다 전담 AI 선생님이 생기고, 선생님은 학습자의 수준·진도·오답·퀴즈 결과를 기억하며 수업을 직접 운영하는 개인 학습 공간.

이 앱은 AI 채팅 클라이언트가 아니다. 채팅은 수업이 일어나는 *수단*이고, 핵심 산출물은 **구조화된 학습 상태**(커리큘럼, 목표 달성 근거, 퀴즈 기록, 요약·기억)다.

## 2. 핵심 사용자

| 사용자 | 상황 | 앱에서 얻는 것 |
|---|---|---|
| 독학 성인 학습자 | Kubernetes, Spring Boot, 외국어 등을 혼자 익힘 | 무엇부터 할지 정해 주는 선생님, 이전 수업 기억 |
| 시작을 어려워하는 학습자 | 귀찮음, 방향 상실, 작은 실패 후 포기 | 짧은 단위 수업 제안, 부담 없는 재개 |
| 개발자 / 기술 학습자 | 이미 Claude Code·Codex를 쓰고 있음 | 기존 CLI 로그인을 그대로 활용, 별도 API 키 불필요 |

1차 MVP의 주 대상은 **이미 Claude Code 또는 Codex CLI를 사용 중인 개인 학습자**다. 일반 대중 배포는 AI Provider 정책 확인 후 결정한다 (→ [AI_PROVIDER.md](AI_PROVIDER.md) 정책 절).

## 3. 차별화 요소

| 요소 | 일반 AI 채팅 | Rhyme Tutor |
|---|---|---|
| 관계 | 매번 새 대화 | 주제별 전담 선생님이 이전 수업을 기억 (Implemented 1차) |
| 주도권 | 사용자가 질문해야 함 | 선생님이 다음 단원·설명·퀴즈를 제안 (Implemented 1차) |
| 진도 | 메시지 수 | 목표(Objective) 단위 근거 기반 진도 (Implemented 1차) |
| 평가 | AI 즉석 판정 | 저장된 정답 키로 채점, AI는 진도를 직접 바꾸지 않음 (Implemented 1차) |
| 개인화 | 고정 시스템 프롬프트 | 온보딩 성향 + 실제 학습 데이터 기반 조정 (초기 설정 반영 1차, 적응형 2차 Planned) |
| 캐릭터 | 없음 또는 이미지 | 이름·성격·말투·교수법이 구조화되어 저장되고 프롬프트에 반영 (Implemented 1차) |
| 데이터 | 서비스 서버 | 로컬 SQLite 저장 (Implemented 1차) |

## 4. 핵심 사용자 경험 (성공 흐름)

MVP의 성공 기준이 되는 흐름:

```
앱 실행 → 성향 설문 → AI 연결 → 학습 주제 생성 → 나만의 선생님 생성
  → 커리큘럼 생성 → 채팅으로 수업 → 퀴즈 → 기록 저장 → 다음 날 학습 재개
```

| 단계 | 사용자가 보는 것 | 상세 문서 |
|---|---|---|
| 성향 설문 | 5문항, 이전/다음, 설정에서 재변경 가능 | [UI_UX.md](UI_UX.md), [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| AI 연결 | Claude / Codex / Mock 설치·로그인 상태, 기본 Provider 선택 | [AI_PROVIDER.md](AI_PROVIDER.md) |
| 주제 생성 | 주제 설명, 목표, 수준, 페이스, 캐릭터 선택 → 주제 확정 | [PRD.md](PRD.md) |
| 선생님 생성 | 이름·성격·말투가 있는 선생님 카드 | [CHARACTER_SYSTEM.md](CHARACTER_SYSTEM.md) |
| 커리큘럼 | 백그라운드 작업으로 모듈·단원·목표 생성, 진행 상태 표시 | [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) |
| 수업 | 선생님이 현재 단원을 시작하고 설명 → 확인 질문 → 다음 제안 | [TUTOR_ENGINE.md](TUTOR_ENGINE.md) |
| 퀴즈 | 객관식·OX, 정답 판정, 해설, 결과 저장 | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| 재개 | 대시보드의 "이어서 수업하기" → 마지막 단원·대화 복원 (Verified, E2E 시나리오 D) | [TUTOR_ENGINE.md](TUTOR_ENGINE.md) |

## 5. 설계 원칙

1. **Local-first** — 학습 상태는 사용자 PC에만 저장. 단, 프롬프트 내용은 선택한 외부 AI 서비스로 전송된다 (완전 오프라인 아님). → [SECURITY.md](SECURITY.md)
2. **Provider Independence** — 학습 상태는 어떤 AI Provider에도 종속되지 않는다. Provider 세션을 저장소로 쓰지 않는다.
3. **Structured Learning State** — 채팅 텍스트가 아니라 테이블에 구조화 저장.
4. **Persistent Tutor Identity** — 캐릭터 정보는 DB에 저장되어 재시작·Provider 변경 후에도 유지.
5. **Evidence over opinion** — 진도 변경은 근거 행(evidence)이 있을 때만. AI 판단은 `ai_inferred`로 구분.
6. **Extensible Skills** — 학습 활동은 공통 Skill 인터페이스로 추가. → [SKILL_SYSTEM.md](SKILL_SYSTEM.md)
7. **Persistent Background Jobs** — 명시적 상태와 복구 정책. → [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md)
8. **Security First** — CLI 인증정보 접근 금지, Renderer 권한 최소화. → [SECURITY.md](SECURITY.md)
9. **MVP First** — 미래 기능은 설계 문서로만. 동작하지 않는 메뉴·더미 버튼 금지.
10. **Documentation as Source of Truth** — 구현이 바뀌면 관련 문서를 함께 갱신.

## 6. 장기 제품 방향

| 단계 | 방향 | 상세 |
|---|---|---|
| 1차 (MVP) | 설문 → 연결 → 주제 → 선생님 → 커리큘럼 → 수업 → 퀴즈 → 기억 | [MVP_SCOPE.md](MVP_SCOPE.md) |
| 2차 (Planned) | 학습 엔진 고도화: 적응형 프로필, 과제·평가·복습, 학습 대시보드, 동기부여, API Provider | [ROADMAP.md](ROADMAP.md) |
| 3차 (Planned / Deferred) | 실감형 선생님: 3D/Live2D, 음성, 지식베이스(RAG), 코드 실습, 플러그인, 선택적 클라우드 | [ROADMAP.md](ROADMAP.md) |

장기 목표는 "고급 AI 개인 학습 플랫폼"이지만, 현재 최우선 목표는 위 성공 흐름을 **안정적으로 끝까지 동작**시키는 것이다.

## 7. 비목표 (Non-goals, 현 단계)

- 서버 운영, 계정 시스템, 결제, 클라우드 동기화 (Deferred)
- 자체 LLM 호스팅 또는 이미지 생성 API 연동
- 학습자 인증정보 수집·재사용, 구독 우회
- 범용 멀티 에이전트 병렬 실행 (Deferred; 2차에서 제한된 워커만 Planned)
