# ROADMAP — 1차 / 2차 / 3차

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 일정(날짜)은 정하지 않는다. 단계 순서와 전환 조건만 정의한다.

## 1. 단계 개요

| 단계 | 목표 | 상태 |
|---|---|---|
| 1차 (MVP) | 성공 흐름을 Mock과 CLI로 끝까지 실행 | Implemented (1차 MVP) 목표. 검증 상태는 PROGRESS.md 기준 (실제 CLI 수동 검증 D-10은 미확인일 수 있음) |
| 2차 | 학습 엔진 고도화, 공식 API 경로, 동기부여 | Planned (2차) |
| 3차 | 실감형 선생님, 음성, 지식베이스, 확장 | Planned (3차) / Deferred |

## 2. Implemented (1차 MVP — 검증 상태는 PROGRESS.md 기준)

범위와 수용 기준: [MVP_SCOPE.md](MVP_SCOPE.md).

**전환 조건 (2차 시작)**
- D-1 ~ D-6 통과 (Mock 기준 E2E 포함)
- 실제 CLI 수동 검증 1회 이상 또는 미검증 사유 명시
- 1차 기능 동결, 결함 목록 정리 완료
- 약관 재검토 결과 기록 (AI_PROVIDER 8.3)

## 3. 2차 (Planned 2차)

| 영역 | 항목 | 관련 문서 |
|---|---|---|
| 학습 엔진 | 적응형 학습 프로필 (행동 기반, 사용자 확인 가능) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| 학습 엔진 | 커리큘럼 재구성 (결과 반영, 사용자 승인) | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| 학습 엔진 | 명확화 질문 (AI 주제 분석) | [PRD.md](PRD.md) |
| 과제 | 과제 생성·제출·채점·피드백·이력 | [SKILL_SYSTEM.md](SKILL_SYSTEM.md) |
| 평가 | 진단·단원·종합 평가 (AssessmentSkill) | [SKILL_SYSTEM.md](SKILL_SYSTEM.md) |
| 복습 | 오답 노트, 간격 반복, 취약 개념 | [LEARNING_SYSTEM.md](LEARNING_SYSTEM.md) |
| 대시보드 | 주간 학습 시간, 달성률, 숙련도 추이, 오답 통계 | [UI_UX.md](UI_UX.md) |
| 동기부여 | 목표 설정, 리마인더, 연속 기록, 복귀 모드 | [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) |
| Provider | Anthropic API, OpenAI API (키는 OS 보안 저장소) | [AI_PROVIDER.md](AI_PROVIDER.md) |
| 작업 | assignment, assessment, review, analytics 워커, 예약 작업 | [BACKGROUND_JOBS.md](BACKGROUND_JOBS.md) |
| 데이터 | 과제·평가·복습 테이블 (마이그레이션 v2 이후), FK 공백 보강 | [DATA_MODEL.md](DATA_MODEL.md) |
| 정책 | 실험적 CLI 어댑터의 기본 노출 여부 재결정 | [AI_PROVIDER.md](AI_PROVIDER.md) |

**2차 전환 조건 (3차 시작)**
- 2차 API Provider 경로가 Mock과 같은 계약 테스트를 통과
- 학습 대시보드 수치가 DB 집계와 일치 (샘플 데이터 검증)
- 과제 채점의 재현성 기준 합의 (같은 입력, 같은 결과 범위)

## 4. 3차 (Planned 3차 / Deferred)

| 영역 | 항목 | 상태 |
|---|---|---|
| 캐릭터 | Live2D 또는 VRM 3D, 감정 모션, 립싱크 | Planned (3차) |
| 캐릭터 | 외형 커스터마이징 | Planned (3차) |
| 음성 | STT, TTS, 음성 대화, 발음 분석 | Planned (3차) |
| 시각화 | 개념도, 차트, 마인드맵 | Planned (3차) |
| 지식베이스 | PDF, TXT, MD, 웹, 코드, Git 자료 수집과 검색 (RAG) | Deferred |
| 코드 실습 | 샌드박스 실행과 채점 | Deferred |
| 주제 | 복제·분기 (course clone/branch) | Deferred |
| 확장 | 플러그인, 스킬 패키지, 콘텐츠 패키지 | Deferred |
| 다국어 | i18n (영어 우선) | Deferred |
| 클라우드 | 선택적 동기화, 계정, 결제, 마켓플레이스 | Deferred |
| 로컬 모델 | Ollama 등 로컬 추론 Provider | Deferred |

3차 항목은 2차 완료 후 우선순위를 다시 정한다. 음성과 3D는 라이선스와 에셋 정책을 먼저 정한다.

## 5. 의존성 그래프

```
1차 MVP
 ├─ 2차 API Provider ─┬─ 3차 로컬 모델 Provider
 │                    └─ 3차 클라우드 (계정 필요)
 ├─ 2차 과제/평가/복습 ─┬─ 3차 지식베이스 (RAG)
 │                      └─ 3차 코드 실습 (샌드박스 필요)
 ├─ 2차 적응형 프로필 ─── 3차 플러그인 (Skill 권한 모델 필요)
 └─ 2차 대시보드 ─────── 3차 시각화
3차 캐릭터 3D/음성 ── 독립 (에셋·라이선스 선행)
```

## 6. 마일스톤 게이트

| 게이트 | 통과 조건 |
|---|---|
| G1 (1차 출시 후보) | MVP_SCOPE D-1 ~ D-8 통과, D-10 상태 명시 |
| G2 (2차 시작) | G1 + 약관 재검토 기록 + 결함 목록 정리 |
| G3 (2차 릴리스) | 2차 항목 수용 기준 통과, 테스트 전략의 2차 시나리오 통과 |
| G4 (3차 시작) | 2차 완료 + 에셋·보안 정책 확정 |

게이트 통과 기록은 `PROGRESS.md`에 남긴다.

## 7. 명시적 하지 않을 것 (현 시점)

- 서버 운영과 계정 시스템 (3차 클라우드 검토 전까지 없음)
- 학습자 데이터 판매, 광고, 행동 추적
- Provider 세션 기반 "기억" (무상태 설계 유지)
- 약관이 명확하지 않은 방식의 자동 인증 우회
