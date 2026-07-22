# 웹 보안(Security) 핵심 — 면접 답변 정리본

> 한국 IT 백엔드 면접용 인증·인가·웹 보안 종합 정리. JWT 내부·OAuth2·권한 모델·공격 방어까지.
> 진행 형식: 비유 → 구조/흐름 → 표 → 실무 함정 → 예상 면접 질문.
> 핵심 관점: **"인증(누구냐) vs 인가(무엇을 할 수 있냐)"를 구분하고, 각 토큰·정책이 "무엇을 막고 무엇을 못 막는지"**를 답할 수 있어야 한다.

## 목차
- [SEC1. JWT·토큰 심층](#sec1-jwt토큰-심층) — 구조·서명·claims, access/refresh·rotation, PAT, 저장 위치
- [SEC2. 인증 서버·OAuth2·권한 모델](#sec2-인증-서버oauth2권한-모델) — Auth Server, OAuth2/OIDC·PKCE, SSO, RBAC vs ABAC
- [SEC3. CORS·동일 출처 정책](#sec3-cors동일-출처-정책) — SOP, Preflight, 자격증명, 흔한 오해
- [SEC4. 웹 공격과 방어](#sec4-웹-공격과-방어-xsscsrfsqli) — XSS·CSRF·SQL Injection, 비밀번호 해싱

---

# SEC1. JWT·토큰 심층

**학습 목표**: *"JWT 구조를 뜯어서 설명해보세요"* / *"서명 검증은 어떻게 하나요? HS256 vs RS256?"* / *"access token과 refresh token을 왜 나누나요? rotation이 뭐죠?"* / *"PAT는 JWT와 뭐가 다른가요?"* / *"토큰을 어디에 저장하나요?"* 에 구조를 그리며 5분 답할 수 있다.

## 1. 비유 — 위조 방지 도장이 찍힌 입장권
JWT는 **위조 방지 도장이 찍힌 입장권**이다. 표 안에 "누구, 등급, 만료시각"이 적혀 있고(claims), 발급처의 도장(서명)이 찍혀 있다. 문지기(서버)는 발급 대장을 뒤질 필요 없이 **도장이 진짜인지만 확인**하면 통과시킨다(무상태 검증). 대신 한 번 발급된 표는 만료 전까지 회수하기 어렵다.

## 2. JWT 구조 — `header.payload.signature` ⭐
```
eyJhbGci...  .  eyJzdWIi...  .  SflKxwRJ...
─── Header ──    ── Payload ──   ── Signature ──
{alg,typ}       {claims}         HMAC/RSA(header+payload, key)
```
- **Header**: 서명 알고리즘(`alg`: HS256/RS256), 타입(`typ`: JWT). Base64URL 인코딩.
- **Payload**: **claims**(주장) 집합. Base64URL 인코딩 — **암호화가 아니라 인코딩**이라 누구나 디코딩해 내용을 볼 수 있다(민감정보 금지!).
- **Signature**: `sign(base64(header) + "." + base64(payload), secret/private key)`. 이 서명으로 **위·변조를 탐지**한다(내용을 바꾸면 서명이 안 맞음).

## 3. Claims — registered / public / private ⭐
| 종류 | 예 | 의미 |
|------|-----|------|
| **Registered**(등록) | `iss`(발급자), `sub`(주체=사용자 id), `exp`(만료), `iat`(발급시각), `aud`(대상), `jti`(토큰 고유 id) | 표준 정의된 claim |
| **Public**(공개) | `email`, `role` | 충돌 방지 위해 이름 규약 |
| **Private**(비공개) | 앱 커스텀 | 발급자-소비자 간 합의 |

- `exp`로 만료를 표현하고, `jti`는 **블랙리스트/재사용 탐지**에 쓴다. `sub`가 사용자 식별자.

## 4. 서명 방식 — HS256 vs RS256 ⭐
| | HS256 (대칭) | RS256 (비대칭) |
|--|--------------|-----------------|
| 키 | **하나의 secret**로 서명·검증 | **개인키로 서명, 공개키로 검증** |
| 검증 주체 | secret을 아는 곳만(발급=검증 같은 곳) | 공개키만 있으면 누구나 검증(발급≠검증 분리 가능) |
| 적합 | 단일 서비스가 발급·검증 | **인증 서버가 발급, 여러 리소스 서버가 검증**(MSA·OAuth2) |

- MSA에서 인증 서버가 RS256으로 서명하면, 각 마이크로서비스는 **공개키(JWKS)** 만 받아 secret 공유 없이 검증 가능 → 그래서 OAuth2/OIDC는 RS256이 흔함.

<details class="deep">
<summary>심화: JWT 서명 취약점 — alg:none, 알고리즘 혼동 공격</summary>

- **`alg: none` 공격**: 과거 일부 라이브러리가 header의 `alg`를 `none`으로 바꾼 토큰을 "서명 없이 유효"로 받아들여 우회당함 → 서버는 **허용 알고리즘을 고정**하고 `none`을 거부해야 함.
- **알고리즘 혼동(RS256→HS256)**: RS256 검증 서버가 알고리즘을 header에서 그대로 신뢰하면, 공격자가 공개키를 HMAC secret처럼 써서 HS256으로 서명한 토큰을 만들어 통과시킬 수 있음 → 검증 시 **알고리즘을 코드에서 명시**(header 값 신뢰 금지).
- 교훈: JWT 보안의 핵심은 "**서명 알고리즘을 서버가 강제**"하는 것. header의 alg를 그대로 믿으면 안 됨.

</details>

## 5. Access Token vs Refresh Token — 왜 나누나 ⭐
```
로그인 → Access Token(짧게, 예 15분) + Refresh Token(길게, 예 2주)
API 호출: Access Token 사용
Access 만료 → Refresh Token으로 새 Access 발급(재로그인 없이)
```
| | Access Token | Refresh Token |
|--|--------------|----------------|
| 수명 | 짧음(분 단위) | 김(일/주 단위) |
| 용도 | 매 API 인증 | Access 재발급 전용 |
| 저장 | 클라 메모리 | 안전 저장(httpOnly 쿠키 등), **서버 저장 병행 흔함** |
| 탈취 시 피해 | 짧아서 제한적 | 크므로 rotation·탐지 필요 |

- **왜 나누나**: Access를 짧게 하면 탈취돼도 곧 만료된다(무상태 무효화의 약점 보완). 그런데 매번 재로그인은 불편 → Refresh로 조용히 재발급.

<details class="deep">
<summary>심화: Refresh Token Rotation과 재사용 탐지(reuse detection)</summary>

- **Rotation(회전)**: Refresh Token을 쓸 때마다 **새 Refresh Token을 발급하고 이전 것은 폐기**. 그래서 한 Refresh는 딱 한 번만 유효.
- **재사용 탐지**: 이미 회전으로 폐기된(사용된) Refresh Token이 다시 들어오면 = **탈취 신호**(정상 클라와 공격자가 같은 토큰을 각자 쓰는 상황). 이때 해당 사용자의 **토큰 패밀리 전체를 무효화**해 강제 로그아웃 → 탈취 대응.
- 이를 위해 Refresh Token은 서버에 저장(해시로)해 상태를 추적한다. 즉 완전 무상태가 아니라 **Access는 무상태, Refresh는 상태 추적**의 하이브리드가 실무 표준.
- 저장 위치: Refresh Token은 JS에서 접근 못 하는 **httpOnly + Secure + SameSite 쿠키**에 두는 게 XSS 탈취 방어에 유리(→ SEC4).

</details>

## 6. PAT (Personal Access Token) — JWT와 뭐가 다른가 ⭐
> **PAT** = 사용자가 발급받아 **스크립트·CI·API 클라이언트가 장기간** 쓰는 토큰(예: GitHub PAT). 비밀번호 대신 프로그램적 접근에 사용.

| | JWT(access) | PAT |
|--|-------------|-----|
| 수명 | 짧음(분) | 길거나 수동 만료(개월~무기한) |
| 상태 | 무상태(서명 검증) | **서버 저장(opaque)** — 검증 시 DB 조회 |
| 형태 | 자체 정보 포함(self-contained) | 보통 랜덤 문자열(불투명), 의미 없음 |
| 무효화 | 만료 전 어려움 | **서버에서 즉시 폐기 가능**(저장하니까) |
| 권한 | claims | **scope**(이 토큰이 할 수 있는 범위 제한) |

- PAT는 서버에 저장하므로 **즉시 폐기 가능**하고 scope로 권한을 좁힌다. 저장 시 **해시**해서 보관(평문 금지, 유출 시 원문 노출 방지) — 비밀번호처럼 취급.
- "opaque token(불투명 토큰)"의 대표 예: 토큰 자체엔 정보가 없고 서버가 매핑을 들고 있음. 무상태 JWT와 반대 축.

## 7. 핵심 포인트 (자주 하는 실수)
- 🔴 "JWT payload는 암호화돼 안전하다" ❌ — **Base64 인코딩일 뿐** 누구나 디코딩. 민감정보(비번·주민번호) 넣지 말 것. 기밀이 필요하면 JWE(암호화).
- 🔴 "서명이 있으니 JWT는 무조건 안전" ❌ — `alg:none`·알고리즘 혼동 공격이 있어 **서버가 알고리즘을 고정**해야 함.
- 🔴 "JWT는 무상태라 서버 저장이 전혀 없다" ❌ — Refresh Token rotation·재사용 탐지·블랙리스트 때문에 실무는 Refresh를 서버 저장. Access만 무상태.
- 🟡 Access Token을 localStorage에 두면 XSS로 탈취 위험 → Refresh는 httpOnly 쿠키, Access는 메모리가 안전.
- 🟡 PAT·Refresh는 저장 시 **해시**(비교는 해시로). DB 유출돼도 원문 토큰이 안 나오게.

## 8. 예상 면접 질문 + 답변 골격
**Q1. "JWT 구조를 설명해보세요."**
> header, payload, signature 세 부분을 점으로 이은 형태입니다. header에는 서명 알고리즘, payload에는 사용자 id·만료 같은 claims가 Base64URL로 인코딩돼 있고, signature는 header와 payload를 secret이나 개인키로 서명한 값입니다. 서버는 이 서명을 검증해 위변조를 탐지하므로 발급 대장을 조회하지 않고 무상태로 인증할 수 있습니다. 단 payload는 암호화가 아니라 인코딩이라 민감정보를 넣으면 안 됩니다.

**꼬리 Q1-1. "HS256과 RS256 중 MSA에선 뭘 쓰고 왜죠?"**
> RS256입니다. HS256은 하나의 secret으로 서명·검증해서 검증하는 모든 서비스가 secret을 공유해야 하는데, 이는 유출 위험이 큽니다. RS256은 인증 서버가 개인키로 서명하고 각 리소스 서버는 공개키(JWKS)로 검증만 하므로 secret 공유 없이 검증을 분산할 수 있습니다. 그래서 발급과 검증이 분리되는 OAuth2/OIDC 환경에 적합합니다.

**Q2. "access token과 refresh token을 왜 나누나요?"**
> JWT는 무상태라 만료 전 강제 무효화가 어렵습니다. 그래서 access token을 짧게(예: 15분) 만들어 탈취 피해를 줄이는데, 매번 재로그인은 불편하므로 수명이 긴 refresh token으로 조용히 재발급합니다. refresh token은 rotation을 적용해 쓸 때마다 새로 발급하고 이전 것을 폐기하며, 이미 폐기된 토큰이 다시 오면 탈취로 보고 토큰 패밀리 전체를 무효화합니다. 그래서 access는 무상태, refresh는 서버가 상태를 추적하는 하이브리드가 됩니다.

**Q3. "PAT는 JWT와 어떻게 다른가요? GitHub 토큰 같은 걸 설계한다면?"**
> PAT는 스크립트나 CI가 장기간 쓰는 토큰이라 서버에 저장하는 opaque(불투명) 토큰으로 만듭니다. JWT처럼 자체 정보를 담지 않고 랜덤 문자열이며, 검증 시 DB를 조회합니다. 대신 서버에 있으니 즉시 폐기가 가능하고 scope로 권한을 좁힐 수 있습니다. 저장할 때는 비밀번호처럼 해시해서 보관해 DB가 유출돼도 원문이 노출되지 않게 하고, 만료·폐기·스코프를 사용자에게 관리하게 합니다.

---

# SEC2. 인증 서버·OAuth2·권한 모델

**학습 목표**: *"인증 서버를 왜 분리하나요?"* / *"OAuth2 Authorization Code 흐름을 설명해보세요"* / *"PKCE가 왜 필요한가요?"* / *"OAuth2와 OIDC 차이는?"* / *"RBAC와 ABAC 차이는?"* 에 흐름을 그리며 5분 답할 수 있다.

## 1. 비유 — 호텔 프런트와 객실 카드키
투숙객이 **프런트(인증 서버)** 에서 신분을 확인받고 **카드키(토큰)** 를 받는다. 각 객실·수영장·헬스장(리소스 서버)은 손님 신분을 다시 확인하지 않고 **카드키가 그 문을 열 권한(scope)이 있는지**만 본다. 프런트를 한 곳으로 모으면 모든 시설이 인증 로직을 각자 구현할 필요가 없다 — 이게 **인증 서버 분리 + SSO**.

## 2. 왜 인증 서버를 분리하나
- **중복 제거**: 여러 서비스가 각자 로그인·비번 관리·토큰 발급을 구현하면 중복·불일치. 인증을 한 서버로 모음.
- **SSO(Single Sign-On)**: 한 번 로그인하면 여러 서비스에 재로그인 없이 접근(구글 계정으로 여러 서비스).
- **관심사 분리**: 리소스 서버(비즈니스)는 "이미 인증된 토큰"만 검증하면 됨. → SEC1의 RS256(공개키 검증)과 맞물림.

## 3. OAuth2 — 위임 인가(delegated authorization) ⭐
> **OAuth2** = 사용자가 비밀번호를 제3자 앱에 주지 않고, **제한된 권한(scope)을 위임**하는 프로토콜. 4개 역할: Resource Owner(사용자), Client(앱), Authorization Server(인증 서버), Resource Server(API).

### Authorization Code Grant + PKCE (표준 흐름) ⭐
```
① 사용자가 "구글로 로그인" 클릭 → Client가 Authorization Server로 리다이렉트
② 사용자가 Auth Server에서 로그인·동의 → Client에 authorization code 전달(리다이렉트)
③ Client가 code + client_secret(+PKCE verifier)를 Auth Server에 제출
④ Auth Server가 access token(+refresh, +id token) 발급
⑤ Client가 access token으로 Resource Server 호출
```
- **왜 code를 한 번 더 교환하나**: 토큰을 리다이렉트 URL에 직접 실으면 브라우저 history·로그에 노출. code는 일회용·단명이라 가로채도 client_secret 없이는 토큰 교환 불가.
- **PKCE(Proof Key for Code Exchange)**: SPA·모바일처럼 client_secret을 숨길 수 없는 **public client**를 위한 보강. Client가 `code_verifier`(랜덤)를 만들고 그 해시(`code_challenge`)를 ①에 보냄 → ③에서 원본 verifier를 제출해 "code를 요청한 그 클라이언트가 맞음"을 증명. **인가 코드 가로채기(interception) 공격 방어**. 요즘은 confidential client에도 권장.

## 4. OAuth2 vs OIDC ⭐
| | OAuth2 | OIDC(OpenID Connect) |
|--|--------|----------------------|
| 목적 | **인가**(authorization) — "이 앱이 내 자원에 접근해도 됨" | **인증**(authentication) — "이 사람이 누구인지" |
| 결과 | access token(자원 접근용) | + **ID token**(사용자 신원, JWT) |
| 관계 | 기반 프로토콜 | OAuth2 **위에 인증 계층을 얹은 것** |

- 흔한 오해: "OAuth2로 로그인한다"는 엄밀히는 OIDC. OAuth2는 원래 **인가** 프로토콜이고, "누구인지"(로그인)를 표준화한 게 OIDC의 **ID token**(사용자 정보를 담은 JWT).

## 5. 권한 모델 — RBAC vs ABAC ⭐
> **RBAC(Role-Based)** = **역할**에 권한을 묶고 사용자에게 역할 부여(user→role→permission). 예: ADMIN, USER, MANAGER.
> **ABAC(Attribute-Based)** = **속성**(사용자·리소스·환경)으로 규칙 평가. 예: "부서=재무 AND 시간=업무시간 AND 금액<1000만원이면 허용".

| | RBAC | ABAC |
|--|------|------|
| 기준 | 역할 | 속성 조합(정책) |
| 장점 | 단순·직관·관리 쉬움 | 세밀·유연(문맥 반영) |
| 단점 | 역할 폭발(세밀해질수록 역할 남발) | 정책 복잡·평가 비용 |
| 실무 | 대부분의 기본 | 세밀 통제 필요 시(금융·헬스케어) |

- **scope**(OAuth2)는 "토큰이 접근 가능한 범위"로 또 다른 인가 차원 — RBAC/ABAC(사용자 권한)와 scope(토큰 권한)를 함께 본다.

## 6. 핵심 포인트 (자주 하는 실수)
- 🔴 "OAuth2 = 로그인" ❌ — OAuth2는 **인가**(위임) 프로토콜. 로그인(인증)은 그 위의 **OIDC(ID token)**.
- 🔴 "SPA는 client_secret을 넣으면 된다" ❌ — 브라우저 코드는 secret을 숨길 수 없음 → **PKCE**로 대체.
- 🔴 "Authorization Code 대신 토큰을 바로 주면 간단" ❌ — Implicit 방식은 토큰 노출 위험으로 **폐기 권고**. Authorization Code + PKCE가 표준.
- 🟡 RBAC는 역할이 세분화될수록 역할 수가 폭발 → 필요 시 ABAC나 역할+scope 조합.
- 🟡 인가는 **매 요청 서버에서** 검증(클라 UI에서 버튼 숨김은 UX일 뿐, 보안 아님).

## 7. 예상 면접 질문 + 답변 골격
**Q1. "OAuth2 Authorization Code 흐름을 설명해보세요."**
> 사용자가 로그인 버튼을 누르면 클라이언트가 인증 서버로 리다이렉트하고, 사용자가 거기서 로그인·동의하면 클라이언트로 authorization code가 돌아옵니다. 클라이언트는 그 code와 client_secret을 인증 서버에 제출해 access token을 교환합니다. 토큰을 리다이렉트에 직접 싣지 않고 일회용 code를 한 번 더 교환하는 이유는, 토큰이 브라우저 히스토리나 로그에 노출되는 걸 막기 위해서입니다.

**꼬리 Q1-1. "PKCE는 왜 필요한가요?"**
> SPA나 모바일 앱은 client_secret을 코드에 숨길 수 없는 public client라, code를 가로채면 토큰을 탈취당할 수 있습니다. PKCE는 클라이언트가 매번 랜덤한 code_verifier를 만들고 그 해시를 인가 요청에 실어 보낸 뒤, 토큰 교환 때 원본 verifier를 제출해 "code를 요청한 그 클라이언트가 맞다"를 증명합니다. 그래서 code를 가로채도 verifier가 없으면 토큰을 못 받습니다. 지금은 confidential client에도 권장됩니다.

**Q2. "OAuth2와 OIDC의 차이는?"**
> OAuth2는 사용자가 비밀번호를 주지 않고 제3자 앱에 제한된 권한을 위임하는 인가 프로토콜이고, 결과로 자원 접근용 access token을 받습니다. OIDC는 그 위에 인증 계층을 얹어 "이 사람이 누구인지"를 담은 ID token(JWT)을 추가로 발급합니다. 흔히 말하는 "구글로 로그인"은 엄밀히 OIDC입니다.

**Q3. "RBAC와 ABAC 중 어떻게 선택하나요?"**
> 대부분은 RBAC로 시작합니다. 역할에 권한을 묶어 관리가 단순하기 때문입니다. 다만 "재무팀이면서 업무시간에 일정 금액 이하만" 같은 문맥 기반 세밀 통제가 필요하면 역할만으로는 역할 수가 폭발하므로 ABAC로 속성 기반 정책을 평가합니다. 실무에서는 RBAC를 기본으로 하고 세밀한 부분만 scope나 속성 조건으로 보강하는 혼합이 흔합니다.

---

# SEC3. CORS·동일 출처 정책

**학습 목표**: *"CORS가 뭔가요? 왜 존재하나요?"* / *"Preflight는 언제 발생하나요?"* / *"CORS 에러는 서버가 거부한 건가요?"* / *"자격증명(쿠키) 포함 요청의 CORS 주의점은?"* 에 흐름을 그리며 5분 답할 수 있다.
> `net-http`에서 HTTP 맥락으로 다뤘다면, 여기서는 **보안 관점(SOP·자격증명·오해)** 중심으로 정리한다.

## 1. 비유 — 남의 집 물건 반출 허가
브라우저(문지기)는 기본적으로 **다른 출처(집)의 자원을 JS가 읽지 못하게** 막는다(동일 출처 정책). 집주인(서버)이 "이 방문자(출처)는 가져가도 좋다"는 허가장(CORS 응답 헤더)을 줘야 문지기가 통과시킨다.

## 2. 동일 출처 정책(SOP)과 CORS ⭐
> **동일 출처(Same-Origin)** = **프로토콜 + 호스트 + 포트**가 모두 같음. 하나라도 다르면 교차 출처(cross-origin).
> **SOP(Same-Origin Policy)** = 브라우저가 교차 출처 자원에 대한 JS 접근을 기본 차단하는 보안 정책(악성 사이트가 내 은행 세션으로 데이터를 훔치는 걸 방지).
> **CORS(Cross-Origin Resource Sharing)** = 서버가 특정 출처에 한해 SOP를 **완화**하도록 허용하는 표준. 서버가 `Access-Control-Allow-Origin` 등 헤더로 "허용"을 선언하면 브라우저가 응답을 JS에 넘긴다.

- **핵심**: CORS는 **브라우저가 강제**한다. 서버는 대개 정상 응답을 보내지만, 응답 헤더에 허가가 없으면 **브라우저가 JS에 응답을 안 넘긴다**(그래서 서버-서버·curl·Postman은 CORS 영향 없음).

## 3. Preflight(사전 요청) ⭐
```
[단순 요청] GET/HEAD/POST + 단순 헤더(text/plain 등) → 바로 전송, 응답 CORS 헤더로 판단
[Preflight]  PUT/DELETE, 커스텀 헤더, application/json 바디 등 "위험할 수 있는" 요청
  ① 브라우저 → OPTIONS (Access-Control-Request-Method/Headers)
  ② 서버 → 허용 응답 (Access-Control-Allow-Methods/Headers/Origin)
  ③ 허용되면 실제 요청 전송
```
- Preflight는 "상태를 바꿀 수 있는 요청을 실제로 보내기 전에 서버 허락을 먼저 받는" 안전장치.

## 4. 자격증명(쿠키) 포함 요청 — 주의 ⭐
- 쿠키·인증 헤더를 실은 교차 출처 요청은 `credentials: 'include'`(fetch) + 서버의 `Access-Control-Allow-Credentials: true`가 둘 다 필요.
- 🔴 이때 서버는 `Access-Control-Allow-Origin: *`(와일드카드)를 **못 쓴다** — 반드시 **구체적 출처**를 명시해야 함(보안상 자격증명 + 모든 출처 허용은 금지).

## 5. 핵심 포인트 (자주 하는 실수)
- 🔴 "CORS 에러 = 서버가 요청을 거부" ❌ — 서버는 보통 정상 응답. **브라우저가** 허가 헤더가 없어 JS에 응답을 안 넘긴 것. (그래서 네트워크 탭엔 응답이 와 있음.)
- 🔴 "CORS는 서버를 보호하는 보안" ❌ — CORS는 **브라우저(사용자)를 보호**. 서버 보안이 아님(서버는 CORS와 무관하게 인증·인가로 스스로 지켜야 함).
- 🔴 "프론트에서 CORS를 풀 수 있다" ❌ — 허용은 **서버 응답 헤더**로만. 프론트는 개발용 프록시로 우회할 뿐.
- 🟡 모든 교차 출처가 preflight를 거치진 않음 — 단순 요청은 바로 감. `application/json` POST는 preflight 발생(흔한 혼동).
- 🟡 자격증명 포함 시 `Allow-Origin: *` 불가 → 구체 출처 + `Allow-Credentials: true`.

## 6. 예상 면접 질문 + 답변 골격
**Q1. "CORS가 뭐고 왜 존재하나요?"**
> 브라우저의 동일 출처 정책 때문에 JS는 기본적으로 다른 출처의 응답을 읽지 못합니다. 악성 사이트가 사용자의 로그인 세션을 이용해 다른 사이트 데이터를 훔치는 걸 막기 위한 브라우저 보안입니다. CORS는 서버가 특정 출처에 한해 이 제한을 완화하도록 허용하는 표준으로, 서버가 Access-Control-Allow-Origin 같은 헤더로 허용을 선언하면 브라우저가 응답을 JS에 넘겨줍니다.

**꼬리 Q1-1. "CORS 에러가 나면 서버가 요청을 거부한 건가요?"**
> 아닙니다. 서버는 대개 정상적으로 응답을 보냈지만, 응답에 허용 출처 헤더가 없어서 브라우저가 그 응답을 JS에 넘기지 않은 것입니다. 네트워크 탭을 보면 응답 자체는 와 있습니다. 그래서 해결은 프론트가 아니라 서버에서 허용 출처·메서드·헤더를 CORS 헤더로 명시하는 것이고, curl이나 서버-서버 호출은 애초에 CORS 영향을 받지 않습니다.

**Q2. "Preflight는 언제, 왜 발생하나요?"**
> PUT·DELETE나 커스텀 헤더, application/json 바디처럼 상태를 바꿀 수 있는 요청은 실제 요청 전에 브라우저가 OPTIONS로 "이 요청 보내도 되냐"고 서버에 먼저 묻습니다. 서버가 허용 메서드·헤더로 응답하면 그때 실제 요청을 보냅니다. 반대로 GET이나 단순 헤더 POST 같은 단순 요청은 preflight 없이 바로 나가고 응답 헤더로만 판단합니다.

---

# SEC4. 웹 공격과 방어 (XSS·CSRF·SQLi)

**학습 목표**: *"XSS와 CSRF의 차이는?"* / *"SQL Injection을 어떻게 막나요?"* / *"비밀번호는 어떻게 저장하나요?"* 에 공격 시나리오와 방어를 들며 5분 답할 수 있다.

## 1. XSS (Cross-Site Scripting) ⭐
> **XSS** = 공격자가 웹 페이지에 **악성 스크립트를 주입**해 다른 사용자의 브라우저에서 실행시키는 공격(세션 쿠키 탈취, 위조 요청 등).

| 유형 | 설명 |
|------|------|
| **Stored** | 악성 스크립트가 DB에 저장돼 조회하는 모든 사용자에게 실행(게시글 등) |
| **Reflected** | URL 파라미터 등이 응답에 그대로 반사돼 실행(피싱 링크) |
| **DOM-based** | 서버 거치지 않고 클라 JS가 위험하게 DOM 조작 |

- **방어**: ① **출력 이스케이프**(사용자 입력을 HTML로 렌더할 때 `<`,`>` 등 인코딩) ② **CSP(Content-Security-Policy)** 헤더로 실행 가능한 스크립트 출처 제한 ③ 쿠키에 **httpOnly**(JS가 쿠키 접근 불가 → 세션 탈취 방어).

## 2. CSRF (Cross-Site Request Forgery) ⭐
> **CSRF** = 로그인된 사용자의 브라우저가 **자동으로 쿠키를 첨부**하는 걸 악용해, 악성 사이트가 사용자 몰래 인증된 요청(송금 등)을 보내게 하는 공격.

- **방어**: ① **CSRF 토큰**(서버가 발급한 예측 불가 토큰을 폼에 포함, 검증) ② **SameSite 쿠키**(`SameSite=Lax/Strict`로 교차 사이트 요청 시 쿠키 미첨부) ③ 쿠키 대신 **Authorization 헤더**로 토큰 전송(자동 첨부 안 됨 → SEC3/SEC1과 연결).

### XSS vs CSRF — 자주 헷갈림 ⭐
| | XSS | CSRF |
|--|-----|------|
| 본질 | 악성 **스크립트 실행**(신뢰된 사이트에서) | 사용자 **의도와 무관한 요청** 위조 |
| 악용 대상 | 사용자 브라우저의 실행 환경 | 서버가 쿠키를 신뢰하는 점 |
| 방어 | 이스케이프·CSP·httpOnly | CSRF 토큰·SameSite·헤더 토큰 |

- XSS는 "스크립트를 심는" 공격, CSRF는 "정상 사용자인 척 요청을 보내는" 공격. XSS가 있으면 CSRF 방어(토큰)도 뚫릴 수 있어 XSS 방어가 더 근본적.

## 3. SQL Injection ⭐
> **SQLi** = 입력값을 SQL 쿼리에 문자열로 이어 붙일 때, 공격자가 SQL 구문을 주입해 인증 우회·데이터 탈취·삭제를 하는 공격.
```
"SELECT * FROM users WHERE id='" + input + "'"
input = "' OR '1'='1"  →  ... WHERE id='' OR '1'='1'  (전체 반환)
```
- **방어**: ① **PreparedStatement(파라미터 바인딩)** — 쿼리 구조와 데이터를 분리해 입력이 구문으로 해석되지 않게(가장 근본적). ② ORM/JPA 사용(내부적으로 바인딩). ③ 입력 검증·최소 권한 DB 계정. → `db-index`/쿼리와 연결.

## 4. 비밀번호 저장 — 해싱 ⭐
- 🔴 **평문·단순 해시(MD5/SHA) 저장 금지** — 유출 시 즉시 노출, 레인보우 테이블로 역산.
- ✅ **salt + 느린 해시(bcrypt, scrypt, Argon2)**: salt로 같은 비번도 다른 해시(레인보우 테이블 무력화), 느린 해시로 무차별 대입(brute-force) 비용을 크게. bcrypt는 work factor로 강도 조절.
- 로그인 검증은 저장된 해시와 입력의 해시를 비교(원문 복원 불가한 단방향).

## 5. 핵심 포인트 (자주 하는 실수)
- 🔴 "입력 검증만 하면 XSS·SQLi 다 막힌다" ❌ — XSS는 **출력 시 이스케이프**, SQLi는 **파라미터 바인딩**이 근본. 입력 검증은 보조.
- 🔴 "CSRF 토큰만 있으면 안전" ❌ — XSS가 뚫리면 스크립트가 토큰을 읽어 우회 가능. XSS 방어가 선행.
- 🟡 REST API가 헤더 토큰(JWT) 인증이면 CSRF 위험이 낮음(쿠키 자동 첨부가 아니라서) → SEC3/SEC1과 연결.
- 🟡 비밀번호는 bcrypt/Argon2로 salt+느린 해시. MD5/SHA256 단독은 부적합(빠른 해시라 brute-force에 취약).

## 6. 예상 면접 질문 + 답변 골격
**Q1. "XSS와 CSRF의 차이는?"**
> XSS는 공격자가 악성 스크립트를 페이지에 주입해 다른 사용자의 브라우저에서 실행시키는 공격으로, 세션 쿠키를 훔치거나 임의 동작을 시킵니다. 방어는 출력 이스케이프, CSP, httpOnly 쿠키입니다. CSRF는 로그인된 사용자의 브라우저가 쿠키를 자동 첨부하는 걸 악용해 사용자 몰래 인증된 요청을 보내게 하는 공격으로, CSRF 토큰이나 SameSite 쿠키, 헤더 기반 토큰으로 막습니다. XSS는 스크립트 실행, CSRF는 요청 위조라는 게 본질적 차이입니다.

**Q2. "SQL Injection을 어떻게 막나요?"**
> 가장 근본적인 방어는 PreparedStatement로 파라미터를 바인딩하는 것입니다. 쿼리 구조와 사용자 입력을 분리해서 입력이 SQL 구문으로 해석되지 않게 하기 때문입니다. JPA 같은 ORM도 내부적으로 바인딩을 하므로 문자열 연결로 쿼리를 만들지만 않으면 대부분 안전합니다. 여기에 입력 검증과 최소 권한 DB 계정을 보조로 씁니다.

**Q3. "비밀번호는 어떻게 저장하나요?"**
> 평문이나 MD5·SHA 같은 빠른 해시로 저장하면 안 됩니다. salt를 더한 bcrypt, scrypt, Argon2 같은 느린 해시를 씁니다. salt는 같은 비밀번호도 다른 해시가 되게 해 레인보우 테이블을 무력화하고, 느린 해시는 무차별 대입 비용을 크게 만듭니다. bcrypt는 work factor로 하드웨어 발전에 맞춰 강도를 올릴 수 있습니다. 검증은 원문 복원 없이 해시끼리 비교합니다.

---

# 핵심 질문 (Quiz)

> 답변을 먼저 떠올린 뒤 펼쳐서 확인하세요.

<details>
<summary>Q1. JWT 구조와 payload의 주의점은?</summary>

- `header.payload.signature` — header(alg·typ), payload(claims), signature(header+payload를 secret/개인키로 서명).
- payload는 **암호화가 아니라 Base64 인코딩** → 누구나 디코딩 가능, 민감정보 금지.
- 서명으로 위변조 탐지 → 서버가 발급 대장 조회 없이 무상태 검증. 단 서버가 **알고리즘을 고정**해야(alg:none·혼동 공격 방어).

</details>

<details>
<summary>Q2. HS256 vs RS256, MSA에선?</summary>

- **HS256**(대칭): 하나의 secret으로 서명·검증 → 검증하는 모든 곳이 secret 공유(유출 위험).
- **RS256**(비대칭): 개인키로 서명, 공개키(JWKS)로 검증 → secret 공유 없이 검증 분산.
- MSA·OAuth2는 인증 서버가 발급, 여러 리소스 서버가 공개키로 검증 → **RS256**.

</details>

<details>
<summary>Q3. access/refresh token 분리와 rotation·재사용 탐지는?</summary>

- Access는 짧게(탈취 피해↓, 무상태 무효화 약점 보완), Refresh는 길게(조용히 재발급).
- **Rotation**: Refresh 쓸 때마다 새로 발급하고 이전 것 폐기(1회용).
- **재사용 탐지**: 폐기된 Refresh가 다시 오면 탈취 신호 → 토큰 패밀리 전체 무효화.
- 그래서 Access=무상태, Refresh=서버 상태 추적의 하이브리드. Refresh는 httpOnly 쿠키·해시 저장.

</details>

<details>
<summary>Q4. PAT는 JWT와 뭐가 다른가?</summary>

- PAT: 스크립트·CI용 장기 토큰. **서버 저장 opaque 토큰**(랜덤 문자열, 검증 시 DB 조회).
- 서버 저장이라 **즉시 폐기 가능**, **scope**로 권한 제한, 저장 시 **해시**(비번처럼).
- JWT(access)는 무상태·자체 정보·짧은 수명·만료 전 무효화 어려움 — 반대 축.

</details>

<details>
<summary>Q5. OAuth2 Authorization Code + PKCE 흐름은?</summary>

- ① Client→Auth Server 리다이렉트 → ② 로그인·동의 후 authorization code 반환 → ③ code+secret(+PKCE verifier)로 토큰 교환 → ④ access(+refresh, +id token) 발급.
- code를 한 번 더 교환하는 이유: 토큰을 리다이렉트에 직접 노출 안 하려고(history·로그).
- **PKCE**: secret을 못 숨기는 public client(SPA·모바일)용. verifier 해시를 인가 요청에, 원본을 토큰 교환에 제출 → 인가 코드 가로채기 방어.

</details>

<details>
<summary>Q6. OAuth2와 OIDC 차이는?</summary>

- **OAuth2**: 인가(위임) 프로토콜 → 자원 접근용 access token. "이 앱이 내 자원에 접근해도 됨".
- **OIDC**: OAuth2 위에 인증 계층 → **ID token(JWT, 사용자 신원)** 추가. "이 사람이 누구인지".
- "구글로 로그인"은 엄밀히 OIDC.

</details>

<details>
<summary>Q7. RBAC vs ABAC는?</summary>

- **RBAC**: 역할에 권한 묶고 사용자에 역할 부여(user→role→permission). 단순·직관, 역할 폭발 위험.
- **ABAC**: 속성(사용자·리소스·환경) 조합 정책 평가. 세밀·유연, 복잡·평가 비용.
- 실무는 RBAC 기본 + 세밀 부분만 scope/속성 보강.

</details>

<details>
<summary>Q8. CORS 에러는 서버가 거부한 것인가? Preflight는?</summary>

- ❌ 서버는 보통 정상 응답. **브라우저가** 허용 헤더(Access-Control-Allow-Origin) 없어 JS에 응답을 안 넘긴 것(SOP). 서버-서버·curl은 CORS 무관.
- CORS는 **브라우저(사용자) 보호**이지 서버 보안이 아님. 허용은 서버 응답 헤더로만.
- **Preflight**: PUT/DELETE·커스텀 헤더·json 바디 등은 OPTIONS로 먼저 허락 확인 후 실제 요청. 단순 요청(GET·단순헤더 POST)은 바로.
- 자격증명 포함 시 `Allow-Origin: *` 불가 → 구체 출처 + `Allow-Credentials: true`.

</details>

<details>
<summary>Q9. XSS와 CSRF의 차이와 방어는?</summary>

- **XSS**: 악성 스크립트 주입→다른 사용자 브라우저에서 실행(쿠키 탈취 등). 방어: 출력 이스케이프·CSP·httpOnly 쿠키.
- **CSRF**: 브라우저의 쿠키 자동 첨부를 악용해 사용자 몰래 인증 요청 위조. 방어: CSRF 토큰·SameSite 쿠키·헤더 토큰(JWT).
- XSS=스크립트 실행, CSRF=요청 위조. XSS가 뚫리면 CSRF 토큰도 읽혀 우회 → XSS 방어가 더 근본.

</details>

<details>
<summary>Q10. SQL Injection 방어와 비밀번호 저장은?</summary>

- **SQLi**: 입력을 쿼리에 문자열로 이어붙일 때 SQL 구문 주입. 방어: **PreparedStatement(파라미터 바인딩)**로 구조·데이터 분리(근본), ORM, 입력 검증, 최소 권한 계정.
- **비밀번호**: 평문·MD5/SHA 금지. **salt + 느린 해시(bcrypt/scrypt/Argon2)** — salt로 레인보우 테이블 무력화, 느린 해시로 brute-force 비용↑. 단방향 비교.

</details>
