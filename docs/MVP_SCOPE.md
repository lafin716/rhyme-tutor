# MVP SCOPE — 1차 범위 확정

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 이 문서의 "Implemented"는 **1차 구현 목표**다. 실제 완료 여부와 검증 결과는 `PROGRESS.md`가 원천이다.

## 1. 1차 목표

> 학습자가 앱을 실행해 성향을 답하고, CLI AI 또는 Mock에 연결한 뒤, 주제와 선생님을 만들고, 커리큘럼으로 수업·퀴즈를 거쳐, 다음 날 같은 자리에서 재개할 수 있다.

## 2. 포함 범위 (In Scope)

| ID | 기능 | 상태 | 수용 기준 요약 |
|---|---|---|---|
| MVP-01 | 앱 초기화, SQLite, 마이그레이션, 로깅 | Implemented (1차 MVP) | 빈 DB 생성, 마이그레이션 1회 적용, 재시작 시 재적용 없음 |
| MVP-02 | 온보딩 설문 5문항 | Implemented (1차 MVP) | 5문항 완료 후 재시작해도 재노출 없음 |
| MVP-03 | AI 연결 (Claude Code, Codex 탐지·테스트 요청) | Implemented (1차 MVP) | 미설치·미로그인·정상 상태를 구분해 안내 |
| MVP-04 | Mock Provider (실패 주입 포함) | Implemented (1차 MVP) | 마커별 오류 코드 재현 |
| MVP-05 | 대시보드와 주제 생성 (멱등) | Implemented (1차 MVP) | 같은 requestId로 중복 생성 없음 |
| MVP-06 | 선생님 생성 (프리셋 4종) | Implemented (1차 MVP) | 4종 중 선택 저장, 재시작 후 동일 |
| MVP-07 | 커리큘럼 백그라운드 생성 | Implemented (1차 MVP) | 모듈·단원·목표 저장, 실패 시 재시도 가능 |
| MVP-08 | 수업 채팅 (스트리밍, 취소, 재시도, 복원) | Implemented (1차 MVP) | 중단·재시도·재시작 후 메시지 유지 |
| MVP-09 | 단원 진도 (명시적 완료, 근거 기반 목표 달성) | Implemented (1차 MVP) | 근거 없이 achieved 불가 |
| MVP-10 | 퀴즈 (객관식·OX, 저장된 정답 채점, 해설, 신고) | Implemented (1차 MVP) | 채점 결과가 DB 정답 키와 일치 |
| MVP-11 | 요약과 기억, Context Builder | Implemented (1차 MVP) | 요약 경계 이후 메시지만 전송, 기억 10개 이하 |
| MVP-12 | 다음 날 재개, 설정, 주제 삭제, JSON 내보내기 | 설정·주제 삭제: Implemented (1차 MVP). 재개 버튼: Verified (E2E). 내보내기 UI: Implemented, E2E 미포함 | 재실행 후 "이어서 수업하기"로 같은 단원 복원 (tests/e2e/d-classroom.spec.ts) |

## 3. 제외 범위 (Out of Scope for 1차)

| 항목 | 단계 | 상태 |
|---|---|---|
| AI 기반 주제 분석과 명확화 질문 | 2차 | Planned (2차) |
| 공식 API Provider (Anthropic, OpenAI) | 2차 | Planned (2차) |
| 과제, 평가, 복습 | 2차 | Planned (2차) |
| 적응형 학습 프로필 | 2차 | Planned (2차) |
| 학습 대시보드 (통계 차트) | 2차 | Planned (2차) |
| 리마인더, 연속 기록, 동기부여 기능 | 2차 | Planned (2차) |
| 추가 워커 (assignment, assessment, review, analytics) | 2차 | Planned (2차) |
| Live2D, VRM, 3D 캐릭터 | 3차 | Planned (3차) |
| 음성 (STT, TTS, 발음 분석, 립싱크) | 3차 | Planned (3차) |
| 학습 자료 지식베이스 (PDF, 웹, Git) | 3차 | Deferred |
| 코드 실습 샌드박스 | 3차 | Deferred |
| 시각화 (개념도, 차트) | 3차 | Planned (3차) |
| 주제 복제·분기 | 3차 | Deferred |
| 다국어 | 3차 | Deferred |
| 플러그인, 클라우드, 계정, 결제 | 3차 | Deferred |
| 자동 설치·자동 로그인 (CLI) | — | 범위 밖 (CLI 설치와 로그인은 사용자가 직접) |
| API 키 입력 UI | 2차 | Planned (2차) |

## 4. 브리프 대비 MVP 조정 사항

| 브리프 요구 | 1차 조정 | 근거 |
|---|---|---|
| AI가 주제를 분석하고 짧게 되묻기 | 폼 입력으로 대체 | 범위와 검증 부담 축소. 명확화 질문은 2차 |
| 학습 기록 유지 (주제 삭제 시) | 주제 단위 cascade 삭제, 다른 주제 기록은 보존 | 삭제 경로를 하나로 단순화 |
| Drizzle 등 ORM | `node:sqlite` + 수작업 저장소 | 네이티브 빌드 제거, 계약과 일치 ([DECISIONS.md](DECISIONS.md) ADR-002) |
| 여러 AI 세션 ID 분리 | Provider 세션을 쓰지 않으므로 매핑 없음 | 무상태 설계 |
| 학습 알림, 경험치 | 1차 제외, 2차 리마인더만 Planned | 브리프 6절·7절 일치 |

## 5. 완료 정의 (Definition of Done, 1차)

| # | 조건 | 검증 |
|---|---|---|
| D-1 | 성공 흐름 전체를 Mock 모드에서 끝까지 수행 | 시나리오 A–D (TEST_PLAN) |
| D-2 | 실패 시나리오 (E, F) 동작 | Mock 실패 마커 |
| D-3 | 재시작 후 재개 | 시나리오 D |
| D-4 | 정적 검사 통과 | `npm run typecheck`, `npm run lint` (결과는 PROGRESS에 기록) |
| D-5 | 단위·통합 테스트 통과 | `npm test` |
| D-6 | E2E 통과 | `npm run test:e2e` |
| D-7 | macOS 패키지 생성 | `npm run package:mac` |
| D-8 | Windows 패키지 생성 | `npm run package:win` (Windows 실행 검증은 별도 호스트 필요, 미검증 상태를 명시) |
| D-9 | 문서 일치 | 구현 변경 시 관련 docs 갱신 |
| D-10 | 실제 CLI 수동 검증 | 로그인 환경에서 1회 이상 (없으면 미검증으로 표기) |

**주의**: 이 문서는 조건을 정의할 뿐이다. 각 항목의 통과 여부는 실행 결과로만 판단하며, 실행하지 않은 항목은 "미검증"으로 보고한다.

## 6. 우선순위 (구현 순서 힌트)

1. 데이터 계층과 마이그레이션 (MVP-01)
2. Provider 계약과 Mock (MVP-04)
3. 온보딩, 주제, 선생님 (MVP-02, 05, 06)
4. 커리큘럼 작업 (MVP-07)
5. 채팅과 맥락 (MVP-08, 11)
6. 진도, 퀴즈 (MVP-09, 10)
7. 재개, 설정, 내보내기 (MVP-12)
8. 실제 CLI 연결 (MVP-03)

실제 순서와 담당은 `docs/MASTER_PLAN.md`를 따른다.

## 7. 1차 리스크

| 리스크 | 영향 | 대응 |
|---|---|---|
| CLI 출력 형식 변경 | 스트리밍 파싱 실패 | 파서 버전 고정, 미지 이벤트 무시, Mock으로 회귀 테스트 |
| CLI 인증 상태 탐지 오류 | 잘못된 연결 안내 | 공식 상태 명령 결과만 사용, 실패 시 "확인 불가" 표시 |
| 모델 출력 스키마 위반 빈발 | 커리큘럼 실패 | 교정 재시도 2회, 실패 안내와 재시도 제공 |
| node:sqlite 안정성 (Node 24) | 저장 오류 | 버전 고정, 실패 시 대체 계획 ADR로 기록 |
| Windows 검증 불가 | 배포 품질 불확실 | 패키지 생성까지만 1차 보장, 실행 검증은 미검증 표기 |
| 약관 정책 변화 | 배포 중단 | 릴리스 전 재검토, 실험적 어댑터 비활성 스위치 |
