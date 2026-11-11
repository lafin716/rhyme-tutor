# SECURITY — 보안 경계와 개인정보

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 규칙 원천: AGENTS.md "Security", ARCHITECTURE 프로세스 모델. 이 문서는 실제 코드(`src/main`, `src/preload`, `src/renderer/index.html`)를 기준으로 현재 구현을 설명하고, 남은 위험과 검증 항목을 정의한다.
> 테스트 수치와 검증 결과는 이 문서에 쓰지 않는다. 최신 상태는 [PROGRESS.md](../PROGRESS.md)를 본다.

## 1. 위협 모델 요약

| 자산 | 위협 | 1차 대응 | 상태 |
|---|---|---|---|
| CLI 자격 증명 (Claude Code, Codex 로그인) | 앱이 읽거나 전송 | 자격 증명 파일 접근 코드 없음 (설계 규칙), 공식 상태 명령(`auth status`, `login status`)만 사용 | Implemented (S-3 verified by leader grep) |
| 학습 데이터 (`tutor.db`) | 로컬 무단 접근 | OS 사용자 권한에 의존. 저장 시 암호화 없음 | Implemented (암호화 Deferred) |
| 학습자 입력 | 셸 주입 | `shell: false`, 인자 고정, 사용자 텍스트는 stdin 또는 임시 파일 | Implemented |
| 학습자 입력 | 프롬프트 주입으로 시스템 규칙 우회 | 시스템 지시와 사용자 입력 분리, Claude는 `--tools ""`, Codex는 `-s read-only` | Implemented (잔여 위험은 8절) |
| Renderer 권한 | XSS 후 메인 프로세스 접근 | contextIsolation, sandbox, nodeIntegration off, 발신자 검사를 거친 허용 IPC만 노출 | Implemented |
| 외부 네비게이션 | 앱 밖 페이지로 이동 | 앱 origin 외 이동과 새 창을 메인에서 차단 | Implemented |
| 외부 콘텐츠 렌더링 | 악성 Markdown/HTML | `react-markdown` 기본 설정 (raw HTML 미허용) | Implemented |
| 빌드 산출물 | 자격 증명·테스트 DB 포함 배포 | 패키지 내용 확인 (S-7) | 검증 필요 |
| 정책 리스크 | 약관 위반 배포 | Provider 정책 절 (AI_PROVIDER 8절), 릴리스 전 재검토 | 릴리스 전 확인 |

## 2. Electron 보안 설정

| 항목 | 값 | 근거 (코드) | 상태 |
|---|---|---|---|
| `contextIsolation` | true | `src/main/index.ts` `createWindow` | Implemented |
| `nodeIntegration` | false | 위와 동일 | Implemented |
| `sandbox` | true | 위와 동일 | Implemented |
| Preload | CJS (`preload/index.cjs`), `TutorApi` 메서드만 노출 | `src/preload/index.ts`, `src/shared/ipc.ts` | Implemented |
| `webSecurity` | 기본값 유지 | 옵션 미지정 | Implemented |
| 네비게이션 제한 | `will-navigate`, `will-frame-navigate`에서 앱 페이지(개발: Vite origin, 배포: `index.html` file URL 접두사) 외 이동 차단 | `hardenWindow`, `isAllowedNavigation` | Implemented |
| 웹뷰 | `will-attach-webview` 차단 | `hardenWindow` | Implemented |
| 새 창 | `setWindowOpenHandler`로 모두 거부 | `hardenWindow` | Implemented |
| 외부 링크 열기 | 링크를 기본 브라우저로 여는 기능 없음. 외부 이동은 모두 차단 | `shell`은 데이터 폴더 열기(`openPath`)에만 사용 | Planned (https 전용 `openExternal`은 2차 후보) |
| 권한 요청 | 모든 권한 요청과 권한 확인을 거부 | `setPermissionRequestHandler`, `setPermissionCheckHandler` | Implemented |
| CSP | `src/renderer/index.html`의 `<meta>` 태그로 전달 (아래 2.2) | `index.html` | Implemented (제약 있음) |

### 2.1 Renderer 제약
- Renderer 코드(`src/renderer/**`)는 `electron`과 `node:*` 모듈을 import하지 않는다. ESLint 규칙으로 강제한다.
- Renderer는 `src/main/**`를 import하지 않는다.
- 파일 경로, SQL, CLI 인자는 Renderer에서 조립하지 않는다. IPC 입력은 항상 메인에서 Zod 검증.

### 2.2 CSP 적용 방식과 한계
CSP 원본은 `src/renderer/index.html`의 `<meta http-equiv="Content-Security-Policy">`다. 배포 빌드(`out/renderer`)에 들어가는 값은 다음과 같다.

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;
connect-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'none'
```

- **개발 서버 전용 확장**: `electron.vite.config.ts`의 `devCsp` 플러그인(`apply: 'serve'`)이 `vite dev`에서만 두 가지를 바꾼다. `script-src`에 `'unsafe-inline'`(React refresh preamble), `connect-src`에 `ws:`, `http://localhost:*`, `http://0.0.0.0:*`(HMR). 빌드 산출물에는 적용되지 않는다. 플러그인은 원본 문자열이 없으면 빌드를 실패시킨다.
- **한계**: `frame-ancestors`는 HTTP 헤더로만 적용된다. `<meta>`로 전달하면 무시된다 (브라우저가 무시). 앱 창이 다른 페이지의 frame으로 끼워지는 위험은 이 CSP로 막지 않는다. 대신 메인의 프레임 네비게이션 차단과 `setWindowOpenHandler`(모두 거부)가 막는다.
- `script-src 'self'`로 배포 빌드에서는 인라인 스크립트가 금지된다.
- 상태: 배포 CSP 문자열은 코드로 확인됨 (Implemented). 개발 서버 확장 적용은 `vite dev` 실행으로 별도 확인이 필요하다 (Unverified in this doc revision).

## 3. IPC 경계

| 규칙 | 내용 | 구현 |
|---|---|---|
| 채널 목록 | `src/shared/ipc.ts`의 `IPC`와 `EVENTS`가 원천. 목록 외 채널 등록 금지 | Implemented |
| 발신자 검사 | 호출 프레임의 URL이 앱 페이지(개발 origin 또는 `index.html` file URL 접두사)인지 확인 후 처리 | `isTrustedSender` (`src/main/index.ts`), `registerIpc` |
| 입력 검증 | 모든 채널 입력을 메인에서 Zod로 검증. preload는 형태만 가볍게 확인 | Implemented |
| 응답 | `Result<T>` 봉투. 예외를 Renderer로 던지지 않는다 | Implemented |
| 오류 | 고정 한국어 메시지와 `AppErrorCode`만 전달. 내부 메시지·경로·stderr는 로그에만 | Implemented |
| 파일 저장 | 저장 경로는 네이티브 저장 대화상자 결과만 사용 (main) | `chooseExportPath` |
| 데이터 폴더 열기 | 고정 경로(`userData`)만 연다 | `openDataDir` |

## 4. Provider 경계 (CLI 실행)

CLI 실행 표면은 `src/main/providers/*`에만 있다.

| 규칙 | 구현 근거 | 상태 |
|---|---|---|
| `spawn(..., { shell: false, windowsHide: true })` | `src/main/providers/process.ts` | Implemented |
| 인자는 고정 배열 + 검증된 모델 별칭만 | `claude-code.ts`, `codex.ts`, `resolve.ts` (`MODEL_ALIAS_RE`은 `src/shared/domain.ts`에 정의) | Implemented |
| 사용자 텍스트는 stdin 또는 임시 파일 | 프롬프트는 stdin, 시스템 지시는 `--system-prompt-file` (Claude) 또는 stdin 블록 (Codex) | Implemented |
| 자격 증명 파일 읽기 금지 | 공식 상태 명령(`auth status`, `login status`)만 사용. 자격 증명 경로(`.credentials`, `auth.json`, `~/.claude/`, `~/.codex/`, keychain) 참조 0건 | Implemented (S-3 leader grep 확인) |
| 환경 변수 최소 전달 (allow-list) | `CHILD_ENV_ALLOWLIST` (아래 4.2) | Implemented (이름 목록은 CLI 문서 대조 필요) |
| 프로세스 트리 종료 | POSIX: 별도 프로세스 그룹에 SIGTERM → 1.5초 후 SIGKILL. Windows: `taskkill /pid N /T /F` | Implemented (Windows 미검증) |
| 임시 파일 위치 | 앱 소유 `<userData>/tmp` 하위 호출별 디렉터리(`call-*`, 권한 0700), 호출 후 삭제 | Implemented |
| 동시 실행 제한 | 전역 AI 슬롯 1개 (채팅, 백그라운드 작업, 퀴즈 공유) | Implemented |

### 4.1 Claude Code 호출 (실제 인자)

```
claude -p --output-format stream-json --verbose --include-partial-messages \
  --tools "" --no-session-persistence --setting-sources project \
  --strict-mcp-config --disable-slash-commands \
  --system-prompt-file <scratch>/system.txt [--model <alias>]
```

- 사용자 프롬프트는 stdin으로 전달한다. 작업 디렉터리(cwd)는 호출별 scratch 디렉터리다.
- `--tools ""`로 모든 도구를 끈다. MCP는 `--strict-mcp-config`로 설정 파일의 서버를 쓰지 않는다.
- `--system-prompt-file`의 `system.txt`는 권한 0600으로 쓰고 호출 뒤 삭제한다.
- 감지: `claude --version`, `claude auth status`(JSON의 `loggedIn`). 10초 제한, cwd는 OS 임시 디렉터리.
- 참고: AGENTS/PROGRESS 결정에 따라 `--bare`는 쓰지 않는다 (OAuth 로그인을 깨뜨림).

### 4.2 Codex 호출 (실제 인자)

```
codex exec --json --skip-git-repo-check --ephemeral -s read-only -C <scratch> [-m <alias>] -
```

- 입력(stdin)은 `<system_instructions>…</system_instructions>` 블록과 `<user_message>…</user_message>` 블록으로 합친다.
- `-s read-only`는 쓰기를 막는다. 읽기 범위는 제한하지 않는다 (8절 잔여 위험).
- `-C <scratch>`는 작업 루트를 호출별 scratch로 지정한다. 이것은 파일 접근 경계가 아니다.
- 감지: `codex --version`, `codex login status`.

### 4.3 환경 변수 allow-list (`CHILD_ENV_ALLOWLIST`, `src/main/providers/resolve.ts`)

자식 프로세스에는 `CHILD_ENV_ALLOWLIST`에 정의된 **52개** 이름만 전달한다 (정확 일치, Windows는 대소문자 무시). 나머지 환경 변수는 전달하지 않는다. 개수는 `resolve.ts` 소스를 직접 세어 확인했다. 목록이 바뀌면 이 개수도 함께 갱신한다.

| 그룹 | 이름 |
|---|---|
| 기본 프로세스·로케일 (15) | `PATH, HOME, USER, LOGNAME, USERPROFILE, APPDATA, LOCALAPPDATA, TMPDIR, TEMP, TMP, LANG, LC_ALL, SystemRoot, ComSpec, PATHEXT` |
| 프록시 (8) | `HTTP_PROXY, HTTPS_PROXY, NO_PROXY, ALL_PROXY` 및 소문자 4개 |
| 사설 CA 번들 (4) | `NODE_EXTRA_CA_CERTS, SSL_CERT_FILE, SSL_CERT_DIR, REQUESTS_CA_BUNDLE` |
| XDG 경로 (3) | `XDG_CONFIG_HOME, XDG_DATA_HOME, XDG_CACHE_HOME` |
| Claude Code (10) | `ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, ANTHROPIC_BASE_URL, CLAUDE_CONFIG_DIR, CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CODE_USE_BEDROCK, CLAUDE_CODE_USE_VERTEX, ANTHROPIC_VERTEX_PROJECT_ID, CLOUD_ML_REGION, GOOGLE_APPLICATION_CREDENTIALS` |
| Codex (3) | `OPENAI_API_KEY, OPENAI_BASE_URL, CODEX_HOME` |
| AWS (Bedrock, 9) | `AWS_REGION, AWS_DEFAULT_REGION, AWS_PROFILE, AWS_CONFIG_FILE, AWS_SHARED_CREDENTIALS_FILE, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN, AWS_BEARER_TOKEN_BEDROCK` |

- 인증·자격 증명 성격의 이름(API 키, 토큰, 자격 증명 파일 경로, `AWS_SECRET_ACCESS_KEY` 등)도 **값을 그대로 자식 CLI에 전달한다.** 앱은 이 값을 읽거나 로그에 남기지 않는다. 다만 자식 CLI가 이 값을 사용할 수 있으므로, 사용자 환경에 이 변수가 있으면 CLI에 노출되는 것으로 본다 (R-8).
- 인증 관련 이름은 CLI가 로그인 방식과 설정 경로를 고르도록 전달하는 것이다. 앱이 저장하지 않는다.
- 이 목록은 현재 CLI 문서와 대조되지 않았다 (PROGRESS Known Issues). 릴리스 전 확인한다.
- 열린 질문: Codex가 실행하는 자체 셸 도구가 앱이 넘긴 allow-list만 상속하는지는 확인되지 않았다. 상속한다고 가정하지 않는다. 릴리스 전 실제 실행 환경 로그로 확인한다 (R-6).

### 4.4 모델 별칭 검증

- 설정의 모델 이름은 provider 호출 직전 `MODEL_ALIAS_RE`로 검사한다: `^[A-Za-z0-9._:[\]][A-Za-z0-9._:\-[\]]{0,63}$`. 첫 글자는 `-`가 될 수 없다.
- 정합 완료: 정규식은 `src/shared/domain.ts`의 `MODEL_ALIAS_RE` 하나만 정의하며, provider(`resolve.ts`), `AppSettingsSchema`, 설정 UI가 모두 이를 쓴다. 검증은 `tests/unit/model-alias.test.ts`가 맡는다 (Implemented).

### 4.5 Windows 실행 (`.cmd` / `.bat`)

- 실행 파일 탐색 순서: `.exe` → `.cmd` → `.bat`.
- `.cmd`·`.bat`는 `ComSpec /d /s /c`로 실행하고 `windowsVerbatimArguments`를 쓴다.
- 이 경로의 실행 파일 경로와 인자는 `WIN_ARG_RE`(`^[A-Za-z0-9_\-.:/\\ =[\]()',;]*$`, `resolve.ts`)를 통과해야 한다. `(`, `)`, `'`, `,`, `;`는 큰따옴표 안에서 cmd.exe가 문자 그대로 처리하므로 `Program Files (x86)` 같은 경로를 위해 허용한다. `WIN_FORBIDDEN_RE`(`[&|<>^%!]`)가 있으면 거부하고, 큰따옴표(`"`)는 허용 문자 집합에 없어 거부된다. 끝 백슬래시도 거부한다 (따옴표 이스케이프 방지).
- **상태: 빌드만 확인됨, 실행 미검증.** Windows 호스트에서 `.cmd` 감지와 인용을 확인하기 전까지 이 경로는 검증된 것으로 보지 않는다 (PKG-02 BLOCKED).

### 4.6 Mock 제공자

- Mock은 항상 등록되고 항상 `experimental: false`, `ready: true`로 보고된다. 화면 표시 이름은 `체험용 모의 응답`이다 (`src/main/providers/mock.ts`).
- 실패 표식(`[[mock:fail]]` 등)은 `TUTOR_ENABLE_MOCK=1`일 때만 동작한다. 환경 변수는 호출마다 확인한다.
- 표식: `[[mock:fail]]`, `[[mock:auth]]`, `[[mock:ratelimit]]`, `[[mock:invalid]]`(curriculum·quiz·summary만), `[[mock:slow]]`.
- 기본 실행(플래그 없음)에서 사용자가 입력한 문장은 표식으로 해석되지 않는다.

## 5. 프롬프트 주입 대응

| 대응 | 설명 | 상태 |
|---|---|---|
| 도구 차단 | Claude는 `--tools ""`. Codex는 `-s read-only`로 쓰기만 막는다 | Implemented (Codex 읽기 범위는 잔여 위험) |
| 역할 분리 | 시스템 지시는 `--system-prompt-file` 또는 stdin의 시스템 블록. 학습자 텍스트는 사용자 턴 | Implemented |
| 출력 검증 | 구조화 출력은 Zod로 검증. 실패 시 교정 프롬프트로 최대 2회 재시도 후 `INVALID_AI_OUTPUT`. 불일치 결과는 저장하지 않음 | Implemented |
| 채점 신뢰 | 정답 판정은 저장된 정답 키로 main이 수행. AI 출력은 채점 근거가 아님 | Implemented |
| 학습 진도 신뢰 | 목표 상태 변경은 근거 행(`objective_evidence`: `quiz` 또는 `self_report`)과 함께만 일어난다. AI가 스스로 진도를 바꾸지 않는다 | Implemented |
| 렌더링 | 튜터 응답 Markdown은 raw HTML을 쓰지 않는다 (`react-markdown` 기본). 링크는 http(s)만 허용 | Implemented (링크 scheme 제한은 렌더러 코드 확인 필요) |

프롬프트 주입은 완전히 막을 수 없다. 위 대응으로 **영향 범위를 학습 응답 텍스트로 한정**하는 것이 목표다.

## 6. 데이터 보호

| 항목 | 1차 정책 |
|---|---|
| 저장 위치 | `<userData>/tutor.db` (WAL 파일 포함), `<userData>/logs/`, 임시 `<userData>/tmp/` |
| 저장 시 암호화 | 없음 (Deferred). 디스크 암호화(FileVault, BitLocker)에 의존 |
| 외부 전송 | 선택한 AI CLI가 프롬프트를 해당 서비스로 전송. 앱 자체 서버 전송 없음 |
| 텔레메트리 | 없음 |
| 로그 | 작업 ID, 상태, 소요 시간, Provider ID, 오류 코드만. 프롬프트·응답·환경 변수·자격 증명 금지. CLI stderr 원문은 로그에도 `last_error`에도 저장하지 않는다 (REV-01 확인) |
| 내보내기 | 학습 데이터만. API 키, CLI 자격 증명, 설정의 비밀 값 제외. 파일 권한 0600은 **새 파일 생성 시에만** 적용된다 (덮어쓰기는 기존 권한 유지). 학습 내용이 들어 있으므로 민감 파일로 취급 |
| 삭제 | 코스 삭제 시 관련 행 cascade 삭제. 삭제 중 해당 코스의 새 작업은 거부된다 (BACKGROUND_JOBS 8절). 파일 수준 보안 삭제는 보장하지 않음 |
| API 키 (2차) | OS 보안 저장소(Keychain / safeStorage). DB·로그·내보내기 금지 (Planned) |

**사용자 고지 문구 (설정, README)**: "학습 내용은 이 PC에 저장됩니다. 질문과 학습 자료는 선택한 AI 서비스(Claude Code 또는 Codex)로 전송되어 응답을 생성합니다."

## 7. 저장소 위생

| 항목 | 규칙 |
|---|---|
| 커밋 금지 | `.env`, 로컬 DB, 로그, 인증 파일, 캡처 중 개인 데이터 |
| 샘플 데이터 | 가상 이름만 사용. 실제 학습 기록 금지 |
| 의존성 | 신규 의존성은 DECISIONS에 사유 기록. 보안 공지 확인 |
| 빌드 산출물 | 패키징 결과물에 `.env`, 테스트 DB가 들어가지 않는지 확인 (S-7) |
| 서명 | 현재 빌드는 서명되지 않았고 기본 Electron 아이콘을 쓴다. macOS Gatekeeper, Windows SmartScreen 경고가 나온다 |

## 8. 잔여 위험 (1차 MVP)

| # | 위험 | 현재 대응 | 계획 |
|---|---|---|---|
| R-1 | Codex `-s read-only`는 쓰기만 막는다. 프롬프트 주입이 성공하면 사용자가 읽을 수 있는 파일을 읽어 응답에 넣을 수 있다. `-C` scratch 디렉터리는 작업 루트만 정하고 읽기 경계가 아니다 | 앱은 자격 증명 파일을 읽지 않는다. 학습자 텍스트와 시스템 지시를 분리한다 | 2차에서 Codex 샌드박스 옵션과 OS 수준 격리 방식을 검토 |
| R-2 | Claude Code는 `--tools ""`로 도구를 끈다. 다만 CLI 자체가 사용자 설정과 로그인 상태를 사용한다 | MCP 서버와 slash command를 끈다 (`--strict-mcp-config`, `--disable-slash-commands`) | 릴리스마다 CLI 옵션 변화 확인 |
| R-3 | Windows `.cmd` 경로의 인용과 감지는 실행 검증되지 않았다 | 허용 문자 검사, 금지 문자 거부 | PKG-02에서 Windows 호스트 검증 |
| R-4 | CSP가 `<meta>`로 전달되어 `frame-ancestors`가 무시된다 | 프레임 네비게이션과 새 창 차단 | 헤더 전달 방식 검토 (2차) |
| R-5 | 내보내기 덮어쓰기는 기존 파일 권한을 유지한다 | 민감 데이터 취급 안내 | 덮어쓰기 시 권한 재설정 검토 |
| R-6 | 환경 변수 allow-list 이름이 현재 CLI 문서와 대조되지 않았다. Codex 자체 셸 도구의 allow-list 상속 여부도 미확인이다 | 최소 목록 (52개) | 릴리스 전 CLI 문서 대조와 상속 여부 확인 |
| R-7 | 서명되지 않은 빌드 | 설치 경고 안내 | 서명·공증은 배포 단계 |
| R-8 | allow-list에 든 자격 증명 성격 변수(API 키, AWS 시크릿 등)가 값 그대로 자식 CLI 프로세스에 전달된다. 앱은 읽지 않지만 CLI가 사용할 수 있다 | 최소 목록, 로그에 값 미기록 | CLI가 실제로 필요한 이름만 남기도록 릴리스 전 재검토 |

## 9. 정책 리스크 (AI Provider)

- CLI 구독 기반 호출은 `experimental`로 분류하며 배포 기본 경로가 아니다.
- 릴리스 전 각 제공사 약관을 재확인하고 결과를 `DECISIONS.md`에 기록한다.
- 조항 번호는 확인 전까지 인용하지 않는다.
- 자세한 정책은 [AI_PROVIDER.md](AI_PROVIDER.md) 8절.

## 10. 검증 체크리스트 (릴리스 전)

이 체크는 **검증 계획**이다. 결과는 실제 실행 후 PROGRESS에 기록하며, 이 문서에서 통과를 주장하지 않는다.

| # | 항목 | 확인 방법 |
|---|---|---|
| S-1 | `shell: true` 사용 없음 | 정적 검색 + 리뷰 (`src/main/providers/*` 대상). **verified (leader grep)**: `child_process`/`spawn`은 `src/main/providers/process.ts`에만 있고 `shell: false`(142, 193행) |
| S-2 | Renderer에서 `electron`, `node:*` import 없음 | ESLint 통과 |
| S-3 | 자격 증명 경로 접근 코드 없음 | 코드 검색 (`.claude`, `.codex` 경로 문자열). **verified (leader grep)**: `.credentials`, `auth.json`, `~/.claude/`, `~/.codex/`, keychain 참조 0건 |
| S-4 | 로그에 프롬프트·응답 본문 없음 | 샘플 실행 로그 점검 |
| S-5 | 내보내기 파일에 비밀 값 없음 | 샘플 내보내기 점검 |
| S-6 | 외부 네비게이션 차단 | E2E 또는 수동 |
| S-7 | 패키지에 `.env`, 테스트 DB 없음 | 패키지 내용 목록 확인 |
| S-8 | 의존성 취약점 검토 | `npm audit` 실행 여부와 결과를 PROGRESS에 기록 |
| S-9 | Windows `.cmd` 감지와 인용 | Windows 호스트에서 실행 (PKG-02) |
