# CHARACTER SYSTEM — 나만의 AI 선생님

> 상태 표기: **Implemented (1차 MVP)** · **Planned (2차 / 3차)** · **Deferred**
> 프리셋 원천: `src/shared/presets.ts`. 저장 스키마: [DATA_MODEL.md](DATA_MODEL.md) 4.4.

## 1. 개념

선생님은 학습 주제마다 한 명씩 생기는 **전담 튜터**다. 이름, 성격, 말투, 교수법이 구조화되어 DB에 저장되고, 모든 수업 프롬프트의 `character` 섹션으로 주입된다. 그래서 앱을 재시작하거나 AI Provider를 바꿔도 같은 선생님으로 이어진다.

| 항목 | 상태 |
|---|---|
| 프리셋 4종 중 선택 | Implemented (1차 MVP) |
| 이름 변경 (생성 시, 최대 20자) | Implemented (1차 MVP) |
| 구조화 저장 및 프롬프트 주입 | Implemented (1차 MVP) |
| 2D SVG 아바타 (코드로 그림) | Implemented (1차 MVP) |
| 감정 상태 표시 (기본 감정 1개) | Implemented (1차 MVP) |
| 선생님 단독 편집·재생성 | Deferred (주제 삭제 후 재생성만 가능) |
| 커스텀 외형 편집기 | Planned (3차) |
| Live2D / VRM 3D 캐릭터 | Planned (3차) |
| 감정 모션, 립싱크 | Planned (3차) |
| 음성 (TTS, STT, 발음 분석) | Planned (3차) |

**MVP 제외**: Live2D, 3D, 외부 이미지 에셋, 이미지 생성 API. 캐릭터는 SVG를 코드로 그린 2D 아바타다.

## 2. 프리셋 4종

| `presetId` | 이름 | 성격 (archetype) | 말투 | 교수법 | 외형 (SVG) | 기본 감정 |
|---|---|---|---|---|---|---|
| `kind-explainer` | 하린 | 친절한 설명형 | 부드럽고 존댓말, 예시 많음 | 단계별 설명, 비유 | 단발머리, 안경 없음 | happy |
| `strict-coach` | 도윤 | 엄격한 과제형 | 짧고 단정한 존댓말 | 목표 체크, 과제 중심 | 짧은 머리, 안경 | idle |
| `motivator` | 하루 | 동기부여 코치형 | 밝고 격려하는 말투 | 작은 성공 쌓기, 칭찬 | 포니테일, 머리띠 | happy |
| `researcher` | 이안 | 연구자·탐구형 | 질문을 던지는 말투 | 가설과 검증, 탐구 질문 | 곱슬머리, 베레모 | idle |

각 프리셋의 세부 문구(personality, speaking_style, teaching_style, expertise, approach 기본 문장)는 구현 시 `presets.ts`에 있으며 이 문서는 요지만 정의한다.

### 2.1 프리셋 추가 규칙
- 새 프리셋은 `presets.ts`와 SVG 아바타 코드를 함께 추가한다.
- 기존 프리셋의 `presetId`는 바꾸지 않는다 (DB에 저장된 값).
- 프리셋 목록 변경은 `DECISIONS.md`에 기록한다.

## 3. 캐릭터 데이터

`tutor_characters` 한 행. 주요 필드:

| 필드 | 설명 |
|---|---|
| `preset_id` | 프리셋 식별자 |
| `name` | 선생님 이름 (생성 시 입력, 기본값은 프리셋 이름) |
| `archetype` | 성격 유형 라벨 |
| `personality` | 성격 서술 |
| `speaking_style` | 말투 규칙 |
| `teaching_style` | 교수법 규칙 |
| `expertise` | 주제와 무관한 전문 분야 설명 (기본 "해당 주제 튜터") |
| `approach` | 학습자 접근 방식. 온보딩 응답에서 생성 시 한 번 파생 |
| `appearance` | SVG 아바타 구성 키 |
| `default_emotion` | 기본 감정 |
| `voice_json` | 3차 음성 설정 예약. MVP는 NULL |
| `prompt_version` | 생성 시점 PromptBuilder 버전 |

**규칙**
- 코스당 1명 (`UNIQUE(course_id)`).
- 생성 후 개별 편집 경로가 없다. 바꾸려면 주제를 삭제하고 새로 만든다 (1차).
- `approach`는 온보딩 응답의 스냅샷이다. 이후 설정을 바꿔도 기존 선생님은 바뀌지 않는다.

## 4. 프롬프트 주입

PromptBuilder의 `character` 섹션은 다음 형식으로 들어간다.

```
[선생님]
이름: {name}
성격: {personality}
말투: {speaking_style}
가르치는 방식: {teaching_style}
학습자 접근: {approach}
```

- 선생님 설명은 **교육 방식**에만 영향을 준다. 사실 판단, 정답 확정, 안전 규칙은 바꾸지 못한다 (`core` 섹션이 우선).
- 사용자가 선생님 이름에 지시문을 넣어도 `core` 규칙이 우선한다. 이름은 20자 이하 문자열로 검증한다.

## 5. 아바타와 감정 (1차 범위)

| 항목 | 1차 구현 |
|---|---|
| 아바타 | 2D SVG 인라인. 헤어, 안경, 액세서리 조합으로 프리셋 구분 |
| 감정 | `default_emotion` 1개만 표시 (happy, idle) |
| 상태 반영 | 응답 중에는 idle 유지. 감정 전환 애니메이션 없음 |
| 이미지 파일 | 사용하지 않음. 모든 그림은 코드 생성 |

접근성: 아바타는 장식이므로 `aria-hidden`. 선생님 이름과 역할은 텍스트로 제공한다.

## 6. 2차 Planned
- 학습 상태(완료, 어려움 기억)에 따른 아바타 표정 변화
- 선생님 메시지 말풍선 톤 조정 (이모지 사용 여부 등 선택)
- 선생님 이름과 말투 편집 (주제 생성 후)

## 7. 3차 Planned / Deferred
| 항목 | 상태 |
|---|---|
| Live2D 또는 VRM 3D 모델 | Planned (3차) |
| 감정 모션과 립싱크 | Planned (3차) |
| 외형 커스터마이징 | Planned (3차) |
| 음성 출력 (TTS) 및 음성 입력 (STT) | Planned (3차) |
| 발음 분석 | Planned (3차) |
| 캐릭터 모델 외부 임포트 | Deferred |

3D·Live2D 도입 전에 캐릭터 에셋 라이선스 정책을 먼저 정한다 ([SECURITY.md](SECURITY.md), [DECISIONS.md](DECISIONS.md)).
