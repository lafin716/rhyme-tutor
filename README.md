# Rhyme Tutor

나만의 AI 선생님과 함께 주제별 커리큘럼을 만들고, 수업·퀴즈·복습을 이어 가는 로컬 우선 데스크톱 학습 앱입니다.

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> "Implemented"는 `src/`에 구현이 있다는 뜻입니다. 테스트 통과 수, 성능 수치, 실행 검증 결과는 이 README에 적지 않고 `PROGRESS.md`를 기준으로 합니다 (see PROGRESS.md).

## 주요 기능 (1차 MVP)

| 기능 | 상태 | 비고 |
|---|---|---|
| 학습 성향 설문 (5문항) | Implemented (1차 MVP) | |
| 주제 생성 (폼 입력, 멱등) | Implemented (1차 MVP) | AI 주제 분석·명확화 질문은 2차 |
| AI 커리큘럼 자동 생성 (백그라운드) | Implemented (1차 MVP) | 실패 시 재시도 가능 |
| 선생님 프리셋 4종 | Implemented (1차 MVP) | SVG 캐릭터 |
| 수업 채팅 (스트리밍, 중단, 재시도) | Implemented (1차 MVP) | 재시작 후 메시지 유지. 복구 안내 표시는 Unverified |
| 단원 진도와 근거 기반 목표 달성 | Implemented (1차 MVP) | 목표 달성은 퀴즈 또는 자기 점검 근거가 있을 때만 |
| 퀴즈 (객관식·OX, 해설, 문항 신고) | Implemented (1차 MVP) | 문항 수는 AI 출력에 따름 |
| 학습 요약과 기억 | Implemented (1차 MVP) | |
| 다음 날 "이어서 수업하기" | Verified (E2E) | 재시작 후 대시보드 카드 → 교실에서 현재 단원·대화 복원 (tests/e2e/d-classroom.spec.ts) |
| JSON 내보내기 | Unverified | 파일 내용의 비밀 값 부재는 테스트 계획 항목. UI 경로 확인 필요 |
| 주제 삭제 | Implemented (1차 MVP) | 진행 중 작업 취소 후 삭제 |
| AI 연결: Claude Code, Codex CLI | Implemented (1차 MVP, experimental) | 사용자가 설치·로그인한 CLI 호출 |
| AI 연결: Mock | Implemented (1차 MVP) | 네트워크 없이 흐름 체험, 실패 마커 지원 |
| Windows 패키지 | Implemented (빌드만) | 빌드 산출물 생성됨. 실행 검증은 Windows 환경 필요 (미검증) |

2차 예정 기능(API 연결, 과제, 복습, 대시보드, 리마인더)과 3차 예정 기능(3D·Live2D, 음성, 지식베이스, 코드 실습)은 [docs/ROADMAP.md](docs/ROADMAP.md)를 참고하세요.

## 스크린샷

_준비 중 (이미지 미포함). 캡처 명령은 아래 "테스트" 절을 보세요._

## 요구 사항

- Node.js 24 이상 (`node:sqlite` 사용), npm
- 선택: Claude Code 또는 Codex CLI 설치와 로그인 (터미널에서 직접 로그인)
  - 없어도 Mock으로 전체 흐름을 체험할 수 있습니다.

앱은 CLI의 자격 증명 파일을 읽지 않습니다. 연결 상태는 공식 상태 명령(`claude auth status`, `codex login status`)의 결과로만 확인합니다.

## 설치와 실행

```bash
npm install
npm run dev          # 개발 모드 (Electron + Vite 개발 서버)
```

| 명령 | 설명 | 상태 |
|---|---|---|
| `npm install` | 의존성 설치 | |
| `npm run dev` | 개발 서버와 Electron 실행 | |
| `npm run build` | 프로덕션 빌드 (`out/`) | |
| `npm run typecheck` | 타입 검사 (main, renderer) | |
| `npm run lint` | ESLint | |
| `npm test` | 단위·통합 테스트 (Vitest) | |
| `npm run test:e2e` | E2E 테스트 (빌드 후 Playwright, Mock 기준) | |
| `npm run package:mac` | macOS 패키지 생성 (`--dir`, 서명 없음) | |
| `npm run package:win` | Windows x64 NSIS 설치본 생성 (서명 없음) | 빌드 확인됨. 실행 검증 미완 |

### 개발 서버 접속 (Tailscale 포함)

`npm run dev`는 렌더러 개발 서버를 `0.0.0.0`에 바인딩하고, `allowedHosts`에 `.ts.net`(하위 도메인 전체)과 `localhost`를 허용합니다 (`electron.vite.config.ts`). 접속 주소는 다음 세 가지 형태로 쓸 수 있습니다. 포트는 Vite 기본값 `5173`이며, 실제 포트는 개발 서버 로그에서 확인하세요.

| 구분 | 주소 예 |
|---|---|
| 로컬 | `http://localhost:5173` |
| LAN | `http://<LAN IP>:5173` |
| Tailscale | `http://<호스트명>.ts.net:5173` 또는 `http://100.x.y.z:5173` |

공용 네트워크에서는 방화벽 설정을 확인하세요. 개발 서버 확장 CSP(`devCsp`)는 `vite dev`에서만 적용됩니다.

## 패키징

```bash
npm run package:mac   # dist/mac-arm64/Rhyme Tutor.app (--dir)
npm run package:win   # dist/Rhyme Tutor Setup 0.1.0.exe (NSIS x64)
```

- 두 빌드 모두 서명·공증이 없고 기본 Electron 아이콘을 씁니다. macOS Gatekeeper, Windows SmartScreen 경고가 뜹니다.
- Windows 산출물은 macOS에서 교차 빌드했습니다. 설치와 실행, `.cmd` CLI 탐지는 Windows 실기에서 검증하지 않았습니다 (미검증).

## Mock 모드

실제 AI 없이 흐름을 확인하려면 Mock을 고르세요. Mock은 설정에 항상 나타납니다. 실패 마커는 환경 변수를 켰을 때만 해석됩니다.

```bash
TUTOR_ENABLE_MOCK=1 npm run dev
```

| 변수 | 기본값 | 설명 |
|---|---|---|
| `TUTOR_ENABLE_MOCK` | 꺼짐 | `1`이면 메시지 속 실패 마커(`[[mock:*]]`)를 해석 |
| `TUTOR_MOCK_DELAY_MS` | 15 | 청크당 응답 지연 (ms) |
| `TUTOR_USER_DATA_DIR` | OS 기본 사용자 데이터 경로 | 데이터 디렉터리 지정 (테스트 격리용) |
| `TUTOR_REAL_CLI` | 꺼짐 | `1`이면 실 CLI 스모크 테스트를 실행 |

마커: `[[mock:fail]]` (PROVIDER_FAILED), `[[mock:auth]]` (로그인 필요), `[[mock:ratelimit]]` (사용량 제한), `[[mock:invalid]]` (구조화 출력 위반), `[[mock:slow]]` (시간 초과·취소 확인용).

## 테스트

| 명령 | 설명 |
|---|---|
| `npm test` | 단위·통합 (Vitest). 실 CLI 테스트는 게이트로 건너뜀 |
| `npm run test:e2e` | Playwright E2E (Electron, Mock) |
| `npx playwright test -c playwright.screens.config.ts` | 화면 캡처 (npm 스크립트 없음) |
| `TUTOR_REAL_CLI=1 npx vitest run tests/unit/providers/real.smoke.test.ts` | 실 Claude Code·Codex 스모크 (로그인된 환경 필요) |

테스트 통과 수와 성능 수치는 [PROGRESS.md](PROGRESS.md)에 실행 환경과 함께 기록합니다.

## 데이터 위치

| 항목 | 경로 |
|---|---|
| 학습 데이터 | `<userData>/tutor.db` (WAL 파일 포함) |
| 마이그레이션 백업 | `<userData>/tutor.db.bak-<이전 버전>` (기존 DB가 있고 마이그레이션이 대기 중일 때) |
| 로그 | `<userData>/logs` (프롬프트와 응답 본문은 기록하지 않음) |

`<userData>`는 Electron의 `app.getPath('userData')` 값입니다. macOS에서는 보통 `~/Library/Application Support/<앱 이름>` 아래에 있습니다.

학습 내용은 이 PC에 저장됩니다. 질문과 학습 자료는 선택한 AI 서비스(Claude Code 또는 Codex)로 전송되어 응답을 생성합니다. 자세한 내용은 [docs/SECURITY.md](docs/SECURITY.md)를 보세요.

## 알려진 한계 (1차)

[PROGRESS.md](PROGRESS.md)의 Known Issues를 요약합니다.

- **서명 없음**: 빌드가 서명·공증되지 않았고 기본 아이콘을 씁니다. 서명 절차는 [docs/RELEASING.md](docs/RELEASING.md)에 있습니다.
- **Windows 실기 실행 없음**: Windows 패키지는 빌드만 확인했고, 이 항목은 사용자 결정으로 해결 처리했습니다. 문제가 생기면 이슈로 알려 주세요.
- **Codex 샌드박스**: `-s read-only`는 쓰기만 막습니다. 사용자가 읽을 수 있는 파일은 Codex가 읽을 수 있습니다 (작업 디렉터리는 앱 임시 폴더로 고정). Claude Code는 `--tools ""`로 도구를 끕니다.
- **CSP와 frame-ancestors**: 렌더러 CSP는 `<meta>`로 전달되므로 `frame-ancestors`는 적용되지 않습니다. 다른 지시문은 적용됩니다.
- **번들 크기**: 렌더러 번들이 약 1.49 MB이며 코드 분할은 아직 없습니다.
- **CLI 환경 변수 목록**: 자식 프로세스에 넘기는 환경 변수 목록(52개)은 현재 CLI 문서와 대조하지 않았습니다. 자격 증명 성격의 변수 값도 CLI에 전달됩니다 ([SECURITY.md](docs/SECURITY.md) §4.3).
- **내보내기 권한**: JSON 내보내기의 0o600은 새 파일을 만들 때만 적용됩니다. 기존 파일을 덮어쓰면 기존 권한이 남습니다. 내보내기 파일에는 학습 내용이 들어 있으니 민감하게 다루세요.
- **설정 화면**: 여러 CLI가 설치돼 있어도 현재 활성 Provider를 표시하지 않습니다.
- **코스 삭제 중 작업**: 삭제 대상 코스의 대기 작업이 잠깐 `running`이 됐다가 취소될 수 있습니다. 실행되지는 않습니다 (단위 테스트로 확인).

## 개발 문서

| 문서 | 내용 |
|---|---|
| [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md) | 제품 비전과 원칙 |
| [docs/PRD.md](docs/PRD.md) | 기능 요구사항과 수용 기준 |
| [docs/MVP_SCOPE.md](docs/MVP_SCOPE.md) | 1차 범위와 완료 정의 |
| [docs/MASTER_PLAN.md](docs/MASTER_PLAN.md) | 1차 구현 계획과 담당 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 1차 / 2차 / 3차 로드맵 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 아키텍처 (프로세스 경계, 시작 복구) |
| [docs/UI_UX.md](docs/UI_UX.md) | 화면 구조와 흐름 |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | 데이터 모델과 마이그레이션 v1 |
| [docs/AI_PROVIDER.md](docs/AI_PROVIDER.md) | AI Provider 계약과 CLI 연결 |
| [docs/TUTOR_ENGINE.md](docs/TUTOR_ENGINE.md) | 튜터 엔진과 맥락 구성 |
| [docs/LEARNING_SYSTEM.md](docs/LEARNING_SYSTEM.md) | 학습 시스템 (진도, 퀴즈, 기억) |
| [docs/CHARACTER_SYSTEM.md](docs/CHARACTER_SYSTEM.md) | 선생님 캐릭터 시스템 |
| [docs/SKILL_SYSTEM.md](docs/SKILL_SYSTEM.md) | 스킬 시스템 |
| [docs/BACKGROUND_JOBS.md](docs/BACKGROUND_JOBS.md) | 백그라운드 작업 큐 |
| [docs/SECURITY.md](docs/SECURITY.md) | 보안 경계와 개인정보 |
| [docs/TEST_PLAN.md](docs/TEST_PLAN.md) | 검증 계획 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 설계 결정 기록 (ADR)과 열린 항목 |
| [docs/RELEASING.md](docs/RELEASING.md) | 릴리스와 코드 서명 |

진행 상황은 [PROGRESS.md](PROGRESS.md)를 보세요.

## 라이선스

[GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`).

이 앱을 수정해 배포하거나, 수정본을 네트워크 서비스로 제공하면 수정한 소스 코드도 같은 라이선스로 공개해야 합니다.
