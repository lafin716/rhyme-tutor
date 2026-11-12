# 릴리스와 코드 서명

이 문서는 Rhyme Tutor 설치 파일을 빌드하고 서명하고 GitHub 릴리스로 올리는 방법을 설명한다.

서명 설정은 `electron-builder.yml`에 이미 들어 있다. 인증 정보는 **환경 변수로만** 넘긴다. 인증서 파일, 비밀번호, API 키는 저장소에 커밋하지 않는다. 환경 변수가 없으면 빌드는 서명 없이 성공한다.

## 1. macOS 서명과 공증

### 준비물 (한 번만)

1. **Apple Developer Program 가입** (연 99달러, https://developer.apple.com/programs/).
2. **Developer ID Application 인증서 발급.**
   - Xcode → Settings → Accounts → 팀 선택 → Manage Certificates → `+` → **Developer ID Application**.
   - 또는 developer.apple.com → Certificates에서 CSR로 발급한 뒤 더블클릭해 키체인에 넣는다.
   - 확인: `security find-identity -v -p codesigning`에 `Developer ID Application: <이름> (<팀 ID>)`가 보여야 한다.
3. **공증용 App Store Connect API 키** (권장).
   - https://appstoreconnect.apple.com/access/integrations/api → Team Keys → `+` (권한: Developer).
   - `AuthKey_XXXXXXXXXX.p8`를 내려받는다(한 번만 받을 수 있음). Key ID와 Issuer ID를 적어 둔다.
   - 키 파일은 저장소 밖에 둔다. 예: `~/.private_keys/AuthKey_XXXXXXXXXX.p8`.

### 빌드

```bash
# 키체인의 Developer ID 인증서는 자동으로 찾는다.
export APPLE_API_KEY=~/.private_keys/AuthKey_XXXXXXXXXX.p8
export APPLE_API_KEY_ID=XXXXXXXXXX
export APPLE_API_ISSUER=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
npm run release:mac
```

- 결과물: `dist/Rhyme-Tutor-<버전>-mac-arm64.dmg`, `dist/Rhyme-Tutor-<버전>-mac-arm64.zip`.
- API 키 대신 Apple ID를 쓰려면 `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`(appleid.apple.com에서 발급한 앱 암호), `APPLE_TEAM_ID`를 설정한다.
- 다른 Mac이나 CI에서 빌드하려면 인증서를 `.p12`로 내보내고 `CSC_LINK=<p12 경로 또는 base64>`, `CSC_KEY_PASSWORD=<암호>`를 쓴다.

### 확인

```bash
codesign --verify --deep --strict --verbose=2 "dist/mac-arm64/Rhyme Tutor.app"
spctl --assess --type execute --verbose "dist/mac-arm64/Rhyme Tutor.app"   # "accepted, source=Notarized Developer ID"
xcrun stapler validate dist/Rhyme-Tutor-<버전>-mac-arm64.dmg
```

## 2. Windows 서명

다음 중 하나를 고른다.

| 방식 | 비용·조건 | 비고 |
|---|---|---|
| **Azure Trusted Signing** (권장) | 월 약 10달러, Azure 구독, 신원 확인 | 하드웨어 토큰 불필요. 개인 개발자는 지역 조건 확인 필요 |
| OV/EV 코드 서명 인증서 (Sectigo, DigiCert 등) | 연 수십~수백 달러 | 2023년 이후 개인키는 하드웨어 토큰(HSM)에 저장해야 함 |

### Azure Trusted Signing

1. Azure Portal에서 Trusted Signing 계정과 Certificate Profile을 만들고 신원 확인을 마친다.
2. 서명용 앱 등록(서비스 주체)을 만들고 `Trusted Signing Certificate Profile Signer` 역할을 준다.
3. `electron-builder.yml`의 `win:` 아래에 추가한다(값은 비밀이 아님):
   ```yaml
   azureSignOptions:
     publisherName: "<인증서의 CN>"
     endpoint: "https://<지역>.codesigning.azure.net"
     certificateProfileName: "<프로필 이름>"
     codeSigningAccountName: "<계정 이름>"
   ```
4. 빌드 시 환경 변수로 `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`을 넘긴다.
5. Azure 서명은 Windows에서 실행해야 한다(PowerShell 모듈 사용). Windows PC나 GitHub Actions `windows-latest`에서 `npm run release:win`.

### OV/EV 인증서 (파일 또는 토큰)

- `.pfx` 파일이면 `WIN_CSC_LINK=<pfx 경로>`, `WIN_CSC_KEY_PASSWORD=<암호>`로 `npm run release:win`.
- 하드웨어 토큰이면 Windows에서 토큰을 꽂고 `win.certificateSubjectName: "<인증서 주체 이름>"`을 설정해 빌드한다.

### 확인

PowerShell에서 `Get-AuthenticodeSignature .\Rhyme-Tutor-Setup-<버전>.exe` → `Status: Valid`.

## 3. GitHub 릴리스

1. `package.json`의 `version`을 올리고 커밋한다.
2. `npm run typecheck && npm run lint && npm test && npm run test:e2e`.
3. `npm run release:mac`, `npm run release:win` (서명 환경 변수 포함).
4. 태그와 릴리스:
   ```bash
   git tag -a v<버전> -m v<버전> && git push origin v<버전>
   gh release create v<버전> --title v<버전> --notes-file notes.md \
     dist/Rhyme-Tutor-Setup-<버전>.exe dist/Rhyme-Tutor-<버전>-win.zip \
     dist/Rhyme-Tutor-<버전>-mac-arm64.dmg dist/Rhyme-Tutor-<버전>-mac-arm64.zip
   ```
5. 이미 올린 릴리스의 파일을 서명본으로 바꾸려면 `gh release upload v<버전> <파일들> --clobber`.
