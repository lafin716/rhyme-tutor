# AI PROVIDER — 연결, 호출, 정책

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 계약 원천: `src/main/providers/types.ts` (leader-owned). CLI 호출 규격: ARCHITECTURE §3.

## 1. 개요

앱은 AI 모델을 직접 호스팅하지 않는다. 사용자 PC에 설치·로그인된 **CLI 도구**를 메인 프로세스에서 자식 프로세스로 실행한다.

| Provider ID | 표시 이름 | 방식 | 단계 | 상태 |
|---|---|---|---|---|
| `claude-code` | Claude Code | `claude` CLI, stream-json 출력 | 1차 | Implemented (1차 MVP, experimental) |
| `codex` | Codex | `codex exec` CLI, JSON 출력 | 1차 | Implemented (1차 MVP, experimental) |
| `mock` | Mock | 결정적 응답, 네트워크 없음 | 1차 | Implemented (1차 MVP) |
| `anthropic-api` | Anthropic API | 사용자 키 기반 공식 API | 2차 | Planned (2차) |
| `openai-api` | OpenAI API | 사용자 키 기반 공식 API | 2차 | Planned (2차) |
| 로컬 모델 (Ollama 등) | — | 로컬 HTTP | 3차 | Deferred |

## 2. 계약 (`AIProvider`)

```ts
interface AIProvider {
  readonly id: ProviderId
  readonly displayName: string
  readonly capabilities: ProviderCapabilities   // tokenStreaming, cancel, structuredOutput
  detect(): Promise<ProviderInfo>               // 공식 상태 명령만 사용
  complete(req: CompletionRequest): Promise<CompletionResult>
}
```

`CompletionRequest` 필드:

| 필드 | 설명 |
|---|---|
| `task` | `chat` · `curriculum` · `quiz` · `summary` · `ping` (로깅, Mock 응답 선택) |
| `system` | PromptBuilder가 조립한 시스템 지시 |
| `prompt` | 사용자 턴 (대화 기록 + 작업 지시). **stdin으로만 전달** |
| `model` | 검증된 모델 별칭 또는 null |
| `timeoutMs` | 하드 제한. 만료 시 프로세스 트리 종료 |
| `signal` | AbortSignal. 취소 시 프로세스 종료 후 `PROVIDER_CANCELLED` |
| `onDelta` | 증분 텍스트 콜백. 스트리밍 미지원 Provider는 전체 텍스트를 한 번 전달 |

**규칙**
- 모든 Provider는 **무상태(stateless)**. 학습 맥락은 호출마다 앱이 조립해 전달한다.
- Provider 내부 세션에 의존하지 않는다 (Claude `--no-session-persistence`, Codex `--ephemeral`).
- `complete`는 정확히 한 번 resolve/reject하며, 자식 프로세스를 남기지 않는다.
- 로그에 프롬프트, 응답 본문, 환경 변수, 자격 증명을 남기지 않는다.

### 2.1 Provider 기능 차이

| 기능 | Claude Code | Codex | Mock |
|---|---|---|---|
| 토큰 스트리밍 | 지원 (partial messages) | 지원 (JSON 이벤트) — 이벤트 형식 검증 후 확정 | 지원 (청크 지연 `mockDelayMs`) |
| 취소 | 프로세스 트리 종료 | 프로세스 트리 종료 | AbortSignal 즉시 |
| 구조화 출력 | 프롬프트 지시 + Zod 검증 | 동일 | 스키마 적합 응답 |
| 모델 선택 | `--model` | `-m` | 무시 |

## 3. CLI 호출 규격 (1차)

### 3.1 Claude Code
```
claude -p --output-format stream-json --verbose --include-partial-messages \
  --tools "" --no-session-persistence --setting-sources project \
  --strict-mcp-config --disable-slash-commands \
  --system-prompt-file <tmp>  [--model <alias>]
```
- 프롬프트는 stdin. 시스템 지시는 임시 파일로 전달 (`--system-prompt-file`).
- `--bare`는 사용하지 않는다. OAuth 로그인을 비활성화하기 때문이다.
- 임시 작업 디렉터리는 앱 소유 디렉터리(`tempRoot`)의 빈 폴더. 호출 후 삭제.
- `--tools ""`: 도구 실행 금지. 학습 앱은 파일·셸 접근이 필요 없다.

### 3.2 Codex
```
codex exec --json --skip-git-repo-check --ephemeral -s read-only -C <scratch> [-m <model>] -
```
- 시스템 지시와 프롬프트를 stdin으로 전달 (`-` 인자는 stdin 읽기).
- `-C <scratch>`: 작업 루트를 앱 소유 빈 임시 디렉터리로 고정. 이것은 작업 루트만 정할 뿐이며, `read-only` 샌드박스가 사용자가 읽을 수 있는 다른 파일의 읽기를 막지는 않는다 (PROGRESS Known Issues).
- `--skip-git-repo-check`: 임시 디렉터리가 git 저장소가 아니어도 실행되도록 함.
- `-s read-only`: 샌드박스 읽기 전용.
- `--ephemeral`: 세션 파일을 남기지 않음.

### 3.3 공통 실행 규칙
| 규칙 | 내용 |
|---|---|
| 실행 위치 | `src/main/providers/*`에서만 `spawn(..., { shell: false })` |
| 인자 | 고정 배열. 사용자 입력은 인자로 넣지 않는다 |
| 사용자 텍스트 | stdin 또는 임시 파일만 |
| 환경 변수 | `CHILD_ENV_ALLOWLIST`(52개, `resolve.ts`)에 있는 이름만 상속. 목록과 예외(자격 증명 성격 변수의 값 전달)는 [SECURITY.md](SECURITY.md) §4.3 참고 |
| 타임아웃 | `requestTimeoutSec` (기본 180초, 30–900초) |
| 종료 | 취소·타임아웃 시 프로세스 트리 전체 종료, 임시 디렉터리 정리 |
| 출력 파싱 | 이벤트 스트림을 줄 단위로 파싱. 알 수 없는 이벤트는 무시하고 로그 레벨 debug |

## 4. 탐지 (`detect`)

| Provider | 탐지 명령 | 결과 |
|---|---|---|
| Claude Code | `claude --version`, `claude auth status` | 설치/미설치, 버전, 로그인 여부 |
| Codex | `codex --version`, `codex login status` | 설치/미설치, 버전, 로그인 여부 |
| Mock | 항상 등록·노출 (`experimental: false`) | 탐지는 항상 성공. `TUTOR_ENABLE_MOCK=1`(또는 옵션)일 때만 실패 마커(§6)가 해석된다 |

**금지 사항**
- 자격 증명 파일 읽기 금지 (예: `~/.claude/` 내부 토큰, `~/.codex/` 인증 파일). 공식 상태 명령의 출력만 사용한다.
- 탐지 결과를 토큰·계정 정보와 함께 저장하지 않는다. `ProviderInfo`(설치 여부, 버전, 로그인 상태 불리언)만 메모리에 둔다.

탐지 결과 상태: `installed`, `authenticated`, `version`, `unavailableReason`. 탐지는 설정 화면 진입 시와 "다시 확인" 버튼으로 수행한다.

## 5. 오류 매핑

| 상황 | `ProviderError` 코드 | 사용자 안내 (한국어 요지) |
|---|---|---|
| 실행 파일 없음 | `PROVIDER_NOT_INSTALLED` | 설치 후 다시 확인하세요 |
| 로그인 필요 | `PROVIDER_AUTH_REQUIRED` | 터미널에서 로그인 후 다시 시도하세요 |
| 사용량 제한 | `PROVIDER_RATE_LIMITED` | 잠시 후 다시 시도하거나 다른 AI를 선택하세요 |
| 제한 시간 초과 | `PROVIDER_TIMEOUT` | 응답이 지연되었어요. 재시도할 수 있어요 |
| 사용자 취소 | `PROVIDER_CANCELLED` | 응답을 중단했어요 |
| 기타 실행 실패 | `PROVIDER_FAILED` | 실행 중 오류가 발생했어요 (상세는 로그) |
| 응답 형식 오류 | `INVALID_AI_OUTPUT` | AI 응답을 해석하지 못했어요 (재시도 가능) |

`ProviderError.detail`에는 stderr 요약 한 줄만 담으며, 본문 로그는 남기지 않는다.

## 6. Mock Provider (1차 필수)

| 항목 | 내용 |
|---|---|
| 목적 | CI, E2E, 오프라인 체험, 실패 경로 검증 |
| 등록 | 레지스트리에 항상 등록되고 목록에 항상 나타난다 (`experimental: false`). 배포 빌드에서도 같다 |
| 마커 활성화 | `TUTOR_ENABLE_MOCK=1` 또는 옵션 `markersEnabled`. 호출 단위로 판정하며, 꺼져 있으면 마커 문자열은 일반 텍스트로 취급된다 |
| 지연 | `TUTOR_MOCK_DELAY_MS` (기본 15ms/청크, 12자 단위 청크. `slow` 마커는 40청크 × 250ms) |
| 결정성 | `task`와 입력 해시에 따라 항상 같은 스키마 적합 응답 |
| 실패 주입 | 프롬프트 내 마커 |

| 마커 | 결과 |
|---|---|
| `[[mock:fail]]` | `PROVIDER_FAILED` |
| `[[mock:auth]]` | `PROVIDER_AUTH_REQUIRED` |
| `[[mock:ratelimit]]` | `PROVIDER_RATE_LIMITED` |
| `[[mock:invalid]]` | 스키마 위반 응답 → `INVALID_AI_OUTPUT` 경로 |
| `[[mock:slow]]` | 지연 증가 → 취소·타임아웃 테스트용 |

마커는 학습자 입력에서만 해석하며 UI에는 노출하지 않는다.

## 7. 설정 (`app_settings`)

| 키 | 기본값 | 범위 |
|---|---|---|
| `activeProvider` | `claude-code` 또는 탐지된 첫 Provider | `claude-code`, `codex`, `mock` |
| `claudeModel` | 비움 (CLI 기본값) | 검증된 별칭 목록만 |
| `codexModel` | 비움 (CLI 기본값) | 검증된 별칭 목록만 |
| `requestTimeoutSec` | 180 | 30–900 |

모델 별칭은 자유 입력을 받지 않는다. 허용 목록에서 선택하며, 실행 인자로 들어가기 전 `MODEL_ALIAS_RE`(`src/shared/domain.ts`, `/^[A-Za-z0-9._:[\]][A-Za-z0-9._:\-[\]]{0,63}$/`)로 검증한다. 이 정규식은 provider(`resolve.ts`), `AppSettingsSchema`, 설정 UI가 함께 쓰는 단일 정의이며, 첫 글자는 `-`가 될 수 없다. 일치 검증은 `tests/unit/model-alias.test.ts`가 맡는다.

## 8. 정책: 구독 CLI 사용의 성격 (중요)

이 절은 제품 정책 문서이며 법률 자문이 아니다. 조항 번호는 확인되지 않았으므로 인용하지 않는다.

### 8.1 현재 분류
- **Claude Code / Codex 어댑터는 `experimental`로 분류한다.** 사용자 본인이 설치하고 로그인한 공식 CLI를 로컬에서 호출하는 방식이며, 각 제공사의 이용 약관과 CLI 사용 조건을 따른다.
- 이 방식은 **제품 배포 기본 경로가 아니다.** 개인 개발·학습 목적의 체험 경로로 한정한다.
- 앱은 CLI 구독 자격 증명을 읽거나, 복사하거나, 다른 프로세스에 전달하지 않는다.

### 8.2 공식 배포 경로 (2차 Planned)
- **Anthropic API**와 **OpenAI API**를 공식 배포 경로로 삼는다.
- 사용자가 직접 발급한 API 키를 입력하면 OS 보안 저장소(macOS Keychain, Windows DPAPI 기반 `safeStorage`)에 저장한다.
- API 키는 SQLite, 로그, 내보내기 파일에 기록하지 않는다.
- API 호출은 메인 프로세스의 HTTP 클라이언트에서 수행하며 Renderer에 키를 노출하지 않는다.

### 8.3 재검토 시점
- **각 릴리스 전에** Anthropic 및 OpenAI의 이용 약관, 사용 정책, CLI 사용 조건을 다시 확인한다. 확인 날짜와 결과는 `DECISIONS.md`에 기록한다.
- 약관이 자동화 호출을 제한하면 해당 Provider를 해당 빌드에서 비활성화한다.
- 공개 배포 여부는 이 재검토 결과에 따라 결정한다.

### 8.4 사용자 고지
- 설정 화면과 README에 "선택한 AI 서비스로 프롬프트가 전송된다"고 명시한다.
- CLI 사용량 한도와 요금은 해당 제공사 정책을 따른다는 안내를 표시한다.

## 9. 테스트 관점

| 항목 | 방법 |
|---|---|
| 계약 준수 | 세 Provider 모두 같은 `complete` 시나리오 테스트 |
| 취소 | Mock slow 마커로 AbortSignal 발동, 자식 프로세스 없음 확인 |
| 타임아웃 | 짧은 `timeoutMs`로 `PROVIDER_TIMEOUT` 확인 |
| 인자 안전성 | 사용자 입력에 셸 메타문자를 넣어도 인자로 전달되지 않음 (정적 검사 + 단위 테스트) |
| 실제 CLI | 수동 검증 (로그인된 환경). 결과는 PROGRESS에 기록 |

자세한 계획은 [TEST_PLAN.md](TEST_PLAN.md).
