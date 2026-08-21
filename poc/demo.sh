#!/usr/bin/env bash
# TRS proof of concept — one credential presentation, walked through as TRQP queries.
# On-screen text is Korean; see poc/README.md (한국어) or poc/README.en.md.
#
#   1. pnpm build:core && cd trs && pnpm start
#   2. ./poc/demo.sh
#
# Override TRS if the resolver is not on localhost:3000.
set -uo pipefail

TRS="${TRS:-http://localhost:3000}"
TRUSTED_LIST="${TRUSTED_LIST_URL:-https://trusted-list.vercel.app}"
REGISTRAR="${REGISTRAR_REGISTRY_URL:-https://dev.api.hopae.com/registrar/registry}"

pretty() { if command -v jq >/dev/null; then jq .; else cat; echo; fi; }

scene() { printf '\n\033[1;4m%s\033[0m\n%s\n' "$1" "$2"; }

query() { # query <title> <endpoint> <json>
  printf '\n\033[1m%s\033[0m\n' "$1"
  printf '  POST %s/%s\n  %s\n' "$TRS" "$2" "$3"
  curl -sS -X POST "$TRS/$2" -H 'content-type: application/json' -d "$3" | pretty
}

# ─────────────────────────────────────────────────────────────────────────────
scene "1. verifier가 mDL을 받았다. 누가 발급했고, 발급할 자격이 있었나?" \
"   verifier가 들고 있는 건 발급자의 이름이 아니라 키다. 그래서 키로 묻는다.
   AUTHORIZATION — 이 주체가 이 일을 해도 되나?"

query "1a  유타주 DLD IACA가 mDL을 발급해도 되나?  → authorized: true" \
  authorization "$(cat <<JSON
{"entity_id":"x509:ski:f67f496c3189b5d8fa1a7dabf2d0714c1db1e2c8",
 "authority_id":"$TRUSTED_LIST",
 "action":"issue","resource":"org.iso.18013.5.1.mDL"}
JSON
)"

query "1b  같은 키에게, 발급 권한이 없는 PID를 묻는다면?  → authorized: false" \
  authorization "$(cat <<JSON
{"entity_id":"x509:ski:f67f496c3189b5d8fa1a7dabf2d0714c1db1e2c8",
 "authority_id":"$TRUSTED_LIST",
 "action":"issue","resource":"eu.europa.ec.eudi.pid.1"}
JSON
)"

# ─────────────────────────────────────────────────────────────────────────────
scene "2. 지갑이 이름을 요구받았다. 이 verifier가 요구할 자격이 있나?" \
"   registrar는 각 relying party가 무엇을 요청하겠다고 등록했는지 기록한다.
   역시 AUTHORIZATION — authority가 다르니 어휘도 다르다."

query "2a  데모 verifier가 mDL의 given_name을 요청해도 되나?  → authorized: true" \
  authorization "$(cat <<JSON
{"entity_id":"HOPAE-DEMO-VERIFIER-LU-01",
 "authority_id":"$REGISTRAR",
 "action":"request","resource":"mso_mdoc/given_name"}
JSON
)"

query "2b  DemoBank이 등록한 적 없는 driving_privileges를 요청하면?  → authorized: false" \
  authorization "$(cat <<JSON
{"entity_id":"DEMO.87654321",
 "authority_id":"$REGISTRAR",
 "action":"request","resource":"mso_mdoc/driving_privileges"}
JSON
)"

# ─────────────────────────────────────────────────────────────────────────────
# The SKI is read from the live registrar, so query 3a asks about the key the
# registrar actually signs with rather than one copied from the docs.
REGISTRAR_CA_SKI=$(
  curl -sS "${REGISTRAR%/registry}/ca-certificate" |
    openssl x509 -noout -ext subjectKeyIdentifier 2>/dev/null |
    tail -1 | tr -d ' :' | tr 'A-Z' 'a-z'
)

scene "3. 잠깐 — 2번에 답한 그 registrar는 누가 보증하나?" \
"   Registrar CA 키, ${REGISTRAR%/registry}/ca-certificate 에서 방금 읽어온 값:
     ${REGISTRAR_CA_SKI:-<조회 실패>}
   RECOGNITION — 이건 애초에 내가 귀 기울여야 할 authority인가?"

query "3a  Scheme Operator가 그 키를 registrar로 인정하나?  → recognized: true" \
  recognition "$(cat <<JSON
{"entity_id":"x509:ski:${REGISTRAR_CA_SKI:-46ec7835d8b06afed37a1680ead1e4f9de3cf481}",
 "authority_id":"$TRUSTED_LIST",
 "action":"register","resource":"http://uri.etsi.org/19602/SvcType/RP/Registration"}
JSON
)"

query "3b  1번의 mDL 발급자를 registrar냐고 물으면?  → recognized: false" \
  recognition "$(cat <<JSON
{"entity_id":"x509:ski:f67f496c3189b5d8fa1a7dabf2d0714c1db1e2c8",
 "authority_id":"$TRUSTED_LIST",
 "action":"register","resource":"http://uri.etsi.org/19602/SvcType/RP/Registration"}
JSON
)"

# ─────────────────────────────────────────────────────────────────────────────
scene "4. 요청이 relying party가 아니라 intermediary를 통해 들어왔다." \
"   역시 RECOGNITION — registrar가 이 주체를 그 RP의 대리로 인정하나?"

query "4a  그 mediated RP가 이 intermediary를 지명했나?  → recognized: true" \
  recognition "$(cat <<JSON
{"entity_id":"urn:eudi:rp:HOPAE-DEMO-INTERMEDIARY-LU-01",
 "authority_id":"$REGISTRAR",
 "action":"mediate","resource":"HOPAE-DEMO-MEDIATED-RP-LU-01"}
JSON
)"

query "4b  지명한 적 없는 일반 verifier에 대해서는?  → recognized: false" \
  recognition "$(cat <<JSON
{"entity_id":"urn:eudi:rp:HOPAE-DEMO-INTERMEDIARY-LU-01",
 "authority_id":"$REGISTRAR",
 "action":"mediate","resource":"HOPAE-DEMO-VERIFIER-LU-01"}
JSON
)"

# ─────────────────────────────────────────────────────────────────────────────
scene "5. 어느 어댑터도 맡지 않는 authority를 지목한 질의." \
"   라우팅은 어댑터가 소유한다. 맡는 어댑터가 없으면 추측하지 않고 그렇다고 말한다."

query "5   아무도 맡지 않는 authority  → 404 application/problem+json" \
  authorization '{"entity_id":"x","authority_id":"https://unknown.example","action":"issue","resource":"mDL"}'
