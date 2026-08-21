# TRS PoC — 실제로 동작하는 트러스트 소스 두 곳

_[English version](./README.en.md)_

resolver에 실제로 배포되어 있는 트러스트 소스 두 곳의 어댑터를 붙였습니다. 스텁 없이 TRQP 질의가 끝까지 처리됩니다.

| 트러스트 소스                                                                                 | 무엇을 진술하는가                                                                 | 어댑터                      |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------- |
| [Scheme Operator Trusted List](https://trusted-list.vercel.app) — ETSI TS 119 602, JAdES 서명 | 어떤 주체가 어떤 크리덴셜을 발급할 수 있는지, 어떤 registrar를 인정하는지         | `libs/adapter-trusted-list` |
| [Relying Party Registrar](https://dev.api.hopae.com/registrar/api) — EUDI ARF TS5, JWS 서명   | 각 relying party가 무엇을 요청하겠다고 등록했는지, 어떤 intermediary가 대리하는지 | `libs/adapter-registrar`    |

## TRQP가 묻는 두 가지 질문

|            | **authorization (권한)**                                           | **recognition (인정)**                                                                 |
| ---------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| 묻는 것    | 이 **주체**가 이 일을 해도 되나?                                   | 이건 답을 믿어도 되는 **authority**인가?                                               |
| 대상       | 그 authority가 관장하는 당사자                                     | 다른 authority (peer)                                                                  |
| 응답       | `authorized: true \| false`                                        | `recognized: true \| false`                                                            |
| 이 PoC에서 | 이 CA가 mDL을 발급해도 되나 · 이 RP가 `given_name`을 요청해도 되나 | 스킴이 이 registrar를 인정하나 · registrar가 이 intermediary를 그 RP의 대리로 인정하나 |

**둘이 합쳐져야 의미가 있습니다.** authorization의 답은 그 답을 준 authority만큼만 가치가 있기 때문입니다. 그래서 제대로 따지는 클라이언트는 두 가지를 다 묻습니다 — _이 주체가 해도 되는가_(authorization, 아래 §2), 그리고 _그렇게 답해준 authority를 내가 믿는 누군가가 보증하는가_(recognition, §3).

recognition이 없으면 처음 만난 트러스트 레지스트리에서 멈춥니다. recognition이 있어야 레지스트리에서 레지스트리로 넘어가며 신뢰를 따라갈 수 있습니다.

## 두 소스가 연결되는 지점

registrar는 Hopae Registrar CA가 발급한 인증서로 자신의 응답에 서명합니다. 그리고 Scheme Operator는 **바로 그 CA**를 자신의 `registrar` Trusted List에 재게시합니다.

그래서 resolver는 registrar의 응답을 검증할 때, registrar가 자기 자신에 대해 제공하는 CA가 아니라 **Scheme Operator가 보증하는 사본**을 앵커로 씁니다. §3이 묻는 것이 정확히 그 키입니다.

```
                 핀 고정된 SO 인증서                  'registrar' Trusted List에
                 (설정값)                              재게시된 CA
                      │                                        │
Trusted List ─────────┴──── JAdES ──┐          ┌── JWS ────────┴──── Registrar
(ETSI TS 119 602)                   ▼          ▼                     (ARF TS5)
                              ┌───────────────────────┐
   client ──── TRQP ─────────►│    trust resolver     │
   (curl)   authorization     │  authority로 라우팅    │
            recognition       └───────────────────────┘
```

## 실행 방법

```bash
pnpm build:core
cd trs && pnpm start          # resolver가 :3000 에 뜹니다
./poc/demo.sh                 # 아래 워크스루 전체 (레포 루트에서 실행)
```

---

# 워크스루: 크리덴셜 제시 한 번, 질문 다섯 개

지갑이 verifier에게 mDL을 제시하는 상황입니다. 아래 각 단계는 그 제시를 받아들이기 전에 **실제로 결정해야 하는 것** 하나이고, 그 뒤에 그것을 결정하는 TRQP 질의가 붙습니다.

## 1. verifier가 mDL을 받았다. 누가 발급했고, 발급할 자격이 있었나?

크리덴셜에는 발급자의 인증서가 들어 있을 뿐, 조회해볼 이름이 있는 게 아닙니다. 그래서 verifier는 자기가 실제로 들고 있는 것 — **키** — 로 묻습니다.

```bash
curl -sX POST localhost:3000/authorization -H 'content-type: application/json' -d '{
  "entity_id": "x509:ski:f67f496c3189b5d8fa1a7dabf2d0714c1db1e2c8",
  "authority_id": "https://trusted-list.vercel.app",
  "action": "issue",
  "resource": "org.iso.18013.5.1.mDL"
}'
# → "authorized": true
#   "message": "… listed on 'attestation-issuers' as 'mDL IACA — IACA-UTAH-USA-002 …' of Utah DLD"
```

이건 실제 미국 유타주 DMV의 IACA 루트입니다. 샌드박스가 직접 발급한 것들과 나란히 등재되어 있습니다.

**같은 키, 권한 밖.** 등재는 명시된 서비스에 대해서만 권한을 줍니다. 같은 IACA에게 PID를 물으면 거부되고, 메시지가 *이 키는 무엇으로 등재되어 있는지*를 알려줍니다.

```bash
curl -sX POST localhost:3000/authorization -H 'content-type: application/json' -d '{
  "entity_id": "x509:ski:f67f496c3189b5d8fa1a7dabf2d0714c1db1e2c8",
  "authority_id": "https://trusted-list.vercel.app",
  "action": "issue",
  "resource": "eu.europa.ec.eudi.pid.1"
}'
# → "authorized": false
#   "message": "… is not listed … for 'issue' on 'eu.europa.ec.eudi.pid.1';
#               it is listed for issue:…/svctype/EAA/Issuance/mDL/mirrored-iaca"
```

## 2. 지갑이 이름을 요구받았다. 이 verifier가 요구할 자격이 있나?

이제 질문이 반대 방향입니다. 발급자가 아니라 **요구하는 쪽**에 대한 질문입니다. relying party는 어떤 claim을 왜 요청할 것인지 미리 등록해두고, 지갑은 들어온 요청을 그 등록 내용과 대조한 다음에야 무언가를 보여줍니다.

```bash
curl -sX POST localhost:3000/authorization -H 'content-type: application/json' -d '{
  "entity_id": "HOPAE-DEMO-VERIFIER-LU-01",
  "authority_id": "https://dev.api.hopae.com/registrar/registry",
  "action": "request",
  "resource": "mso_mdoc/given_name"
}'
# → "authorized": true
#   "message": "… has a registered intended use covering 'given_name' in mso_mdoc"
```

§1과 **같은 operation**이지만 authority가 다릅니다. 그래서 `entity_id`·`action`·`resource`가 전부 Trusted List가 아니라 registrar의 어휘로 바뀝니다. `authority_id`로 라우팅한다는 건, 호출하는 쪽이 둘 중 어디와 이야기하는지 몰라도 된다는 뜻입니다.

**등록하지 않은 claim.** DemoBank는 PID claim만 등록했으므로 운전 권한 요청은 거부됩니다.

```bash
curl -sX POST localhost:3000/authorization -H 'content-type: application/json' -d '{
  "entity_id": "DEMO.87654321",
  "authority_id": "https://dev.api.hopae.com/registrar/registry",
  "action": "request",
  "resource": "mso_mdoc/driving_privileges"
}'
# → "authorized": false
```

registrar는 **부정 응답에도 서명**합니다. 그래서 resolver가 이걸 에러가 아니라 하나의 결정으로 돌려줄 수 있습니다.

## 3. 잠깐 — §2에 답한 그 registrar는 누가 보증하나?

§2의 답은 그 뒤에 있는 registrar만큼만 믿을 수 있습니다. 이건 authorization으로는 물을 수 없는 질문이고, **recognition이 존재하는 이유**입니다: _이건 애초에 내가 귀 기울여야 할 authority인가?_

아래 키는 Registrar CA이고, `demo.sh`는 이 값을 질의 전에 **라이브 registrar에서 직접 읽어옵니다**. 문서에 적힌 값을 복사하는 게 아니라, registrar가 실제로 서명에 쓰는 키를 묻는 것입니다.

```bash
curl -sX POST localhost:3000/recognition -H 'content-type: application/json' -d '{
  "entity_id": "x509:ski:46ec7835d8b06afed37a1680ead1e4f9de3cf481",
  "authority_id": "https://trusted-list.vercel.app",
  "action": "register",
  "resource": "http://uri.etsi.org/19602/SvcType/RP/Registration"
}'
# → "recognized": true
#   "message": "… listed on 'registrar' as 'Relying Party Access CA' of Hopae Registrar"
```

**다른 것의 authority라고 해서 이것의 authority는 아닙니다.** §1의 mDL 발급자도 Trusted List에 올라 있지만, 발급자로서입니다. registrar냐고 물으면 거부되고 — 메시지 뒤에 붙는 절이 "권한 밖"과 "처음 보는 키"를 구분해줍니다.

```bash
curl -sX POST localhost:3000/recognition -H 'content-type: application/json' -d '{
  "entity_id": "x509:ski:f67f496c3189b5d8fa1a7dabf2d0714c1db1e2c8",
  "authority_id": "https://trusted-list.vercel.app",
  "action": "register",
  "resource": "http://uri.etsi.org/19602/SvcType/RP/Registration"
}'
# → "recognized": false
#   "message": "… does not recognize … for 'register' …;
#               it is listed for issue:…/svctype/EAA/Issuance/mDL/mirrored-iaca"
```

어느 리스트에도 없는 키 역시 false가 나오는데, 뒤에 붙는 절이 없습니다. `x509:ski:deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`로 확인해보세요.

## 4. 요청이 relying party가 아니라 intermediary를 통해 들어왔다

relying party가 지갑과 직접 이야기하지 않는 경우가 많습니다. 플랫폼이 대신 앞에 섭니다. 남을 대신해 들어온 요청을 받아들이기 전에, 지갑은 **그 위임이 실제인지** 확인해야 합니다.

```bash
curl -sX POST localhost:3000/recognition -H 'content-type: application/json' -d '{
  "entity_id": "urn:eudi:rp:HOPAE-DEMO-INTERMEDIARY-LU-01",
  "authority_id": "https://dev.api.hopae.com/registrar/registry",
  "action": "mediate",
  "resource": "HOPAE-DEMO-MEDIATED-RP-LU-01"
}'
# → "recognized": true, "message": "… registered … as its intermediary"
```

**위임은 RP별 관계이지, intermediary가 들고 다니는 자격증이 아닙니다.** 같은 intermediary를, 자기를 지명한 적 없는 verifier에 대해 물으면:

```bash
curl -sX POST localhost:3000/recognition -H 'content-type: application/json' -d '{
  "entity_id": "urn:eudi:rp:HOPAE-DEMO-INTERMEDIARY-LU-01",
  "authority_id": "https://dev.api.hopae.com/registrar/registry",
  "action": "mediate",
  "resource": "HOPAE-DEMO-VERIFIER-LU-01"
}'
# → "recognized": false, "message": "… did not register … as its intermediary"
```

> 이 부분은 recognition의 해석을 조금 늘린 것입니다. 원래 recognition에서 인정 대상이 되는 peer는 다른 트러스트 레지스트리인데, intermediary는 위임받아 행위하는 당사자입니다. 질문의 모양(_이 주체를 이 역할로 인정하는가_)이 같아서 recognition으로 모델링했지만, TRQP가 그렇게 규정한 것은 아닙니다.

## 5. 아무 어댑터도 맡지 않는 authority

라우팅은 어댑터가 소유합니다. 어느 어댑터도 권한이 없으면 resolver는 추측하지 않고 그렇다고 말합니다.

```bash
curl -sX POST localhost:3000/authorization -H 'content-type: application/json' -d '{
  "entity_id": "x", "authority_id": "https://unknown.example",
  "action": "issue", "resource": "mDL"
}'
# → 404 application/problem+json, "title": "NoAdapterError"
```

---

## 질의 어휘

`authority_id`가 어댑터를 고르고, 나머지는 그 트러스트 소스 고유의 어휘입니다.

**Trusted List** — `authority_id: https://trusted-list.vercel.app`

| 필드        | 허용되는 값                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_id` | `x509:ski:<hex>`, `x509:sha256:<hex>`, 또는 엔티티 이름 / 상호 / 정보 URI / 인증서 subject DN                                                                                                                                    |
| `action`    | `…/Issuance/…` 서비스는 `issue`, `…/Registration`은 `register`                                                                                                                                                                   |
| `resource`  | 전체 service-type URI, 그 URI의 세그먼트 하나(`mDL`, `PID`, `SD-JWT-VC`, `mirrored-iaca` …), 또는 거기에 매핑되는 크리덴셜 타입(`org.iso.18013.5.1.mDL`, `eu.europa.ec.eudi.pid.1`, `urn:eudi:pid:1`, `org.iso.23220.photoid.1`) |

**Registrar** — `authority_id: https://dev.api.hopae.com/registrar/registry`

| 필드        | 허용되는 값                                                                                                                              |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_id` | 등록된 식별자(`HOPAE-DEMO-VERIFIER-LU-01`), 또는 TRQP가 URI를 요구하는 자리에서는 `urn:eudi:rp:<식별자>` 나 `<registryURI>/wrp/<식별자>` |
| `action`    | authorization은 `request` / `present`, recognition은 `mediate`                                                                           |
| `resource`  | authorization: `<포맷>/<claim>` 또는 `<claim>` · recognition: intermediary가 대리하는 RP의 식별자                                        |

다른 배포처를 바라보게 하려면 `TRUSTED_LIST_URL`, `TRUSTED_LIST_SO_CERT_SHA256`, `REGISTRAR_REGISTRY_URL`, `REGISTRAR_TRUST_ANCHOR_URL` 환경변수를 쓰면 됩니다 (`apps/resolver/src/adapters/adapters.module.ts` 참고).

## 무엇을 검증하고, 무엇을 검증하지 않나

**매 질의마다 검증합니다:**

- 각 Trusted List의 JAdES 서명을, **핀 고정된** Scheme Operator 인증서에 대해 검증합니다. 핀이 없는 서명은 "누군가가 서명했다"는 것밖에 증명하지 못합니다.
- 각 registrar 응답의 JWS 서명, 그리고 그 서명자 인증서가 **Scheme Operator가 재게시한** Registrar CA로 체인이 이어지는지.
- 서명자 인증서의 유효기간, registrar 응답의 `exp`, 그리고 JWS의 `alg`/`crit` 헤더 (`alg: none`, 모르는 `crit`, `b64: false`는 무시가 아니라 거부).

**이 PoC에서 의도적으로 범위 밖인 것** — 각각 resolver가 현재 내리지 _않는_ 판단입니다:

- **두 질문의 연결.** §3이 §2를 정당화하지만 resolver가 그걸 강제하지는 않습니다. recognition을 먼저 묻든 안 묻든 authorization 답은 나옵니다.
- **폐기(revocation).** 등재된 앵커나 RP 액세스 인증서에 대해 CRL·status list를 확인하지 않습니다. 폐기됐지만 등록은 되어 있는 주체도 통과합니다.
- **리스트 신선도.** 리스트의 `nextUpdate`를 강제하지 않으므로, 오래됐지만 서명은 유효한 리스트도 받아들입니다.
- **claim의 doctype 스코핑.** registrar의 `check-intended-use`가 `credentialmeta` 파라미터를 객체와 비교해서 절대 매치되지 않습니다. 그래서 어댑터는 포맷과 claim 경로 세그먼트로만 거릅니다 — `mso_mdoc/given_name`은 **어느 mdoc doctype에 등록된** `given_name`이든 통과합니다. doctype 단위로 좁히려면 registrar 쪽 수정이 필요합니다.
- **캐시 TTL.** 어댑터가 `freshUntil`을 돌려주지만 `ResolverService`는 여전히 모든 결정을 일괄 60초 캐시합니다.
- **과거 시점 질의.** `context.time`은 `time_requested`로 되돌려주기만 하고, 과거 시점 기준으로 평가하는 데 쓰이지 않습니다.
