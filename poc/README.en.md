# TRS proof of concept — two live trust sources

*[한국어 버전](./README.md)*

The resolver ships with adapters for two real, deployed trust sources, so a TRQP query can be
answered end to end without a stubbed handler:

| Trust source                                                                                     | What it states                                                                           | Adapter                     |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | --------------------------- |
| [Scheme Operator Trusted Lists](https://trusted-list.vercel.app) — ETSI TS 119 602, JAdES-signed | which entities may issue which credentials, and which registrar it recognizes            | `libs/adapter-trusted-list` |
| [Relying-party registrar](https://dev.api.hopae.com/registrar/api) — EUDI ARF TS5, JWS-signed    | what each relying party registered itself to request, and which intermediary acts for it | `libs/adapter-registrar`    |

## The two questions TRQP asks

|         | Authorization                                                          | Recognition                                                                                                          |
| ------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Asks    | may this **entity** do this thing?                                     | is this an **authority** whose answers count?                                                                        |
| About   | a party the authority governs                                          | a peer authority                                                                                                     |
| Answers | `authorized: true \| false`                                            | `recognized: true \| false`                                                                                          |
| Here    | may this CA issue an mDL · may this relying party request `given_name` | does the scheme accept this registrar · does the registrar accept this intermediary as acting for that relying party |

They compose, and that is the point. An authorization answer is only worth as much as the authority
that gave it, so a client that cares asks both: _may this party do it_ (authorization, §2 below), and
_does anyone I trust vouch for the authority that told me so_ (recognition, §3). Recognition is what
lets a resolution walk from one trust registry to the next instead of stopping at the first one.

## How the two sources connect

The registrar signs its answers with a certificate issued by the Hopae Registrar CA; the Scheme
Operator republishes that same CA on its `registrar` Trusted List. So the resolver anchors the
registrar's answers on the copy of the CA the Scheme Operator vouches for — never on the copy the
registrar serves about itself — and §3 asks the Scheme Operator about exactly that key.

```
                 pinned SO cert                      CA republished on the
                 (config)                            'registrar' Trusted List
                      │                                        │
Trusted List ─────────┴──── JAdES ──┐          ┌── JWS ────────┴──── Registrar
(ETSI TS 119 602)                   ▼          ▼                     (ARF TS5)
                              ┌───────────────────────┐
   client ──── TRQP ─────────►│    trust resolver     │
   (curl)   authorization     │  route by authority   │
            recognition       └───────────────────────┘
```

## Run it

```bash
pnpm build:core
cd trs && pnpm start          # resolver on :3000
./poc/demo.sh                 # the whole walkthrough below, from the repo root
```

The script's on-screen narration is Korean (it was written for a Korean-audience demo); the queries
and responses are the same ones documented below.

---

# Walkthrough: one presentation, five questions

A wallet presents an mDL to a verifier. Each step below is a real thing that has to be decided
before the presentation can be accepted, followed by the TRQP query that decides it.

## 1. A verifier receives an mDL. Who issued it, and were they allowed to?

The credential carries an issuer certificate, not a name the verifier can look up. So the verifier
asks about the key it actually holds: **may the entity behind this key issue an mDL?**

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

This one is a mirrored real-world IACA (Utah DLD), listed alongside the sandbox's own issuers.

**The same key, out of scope.** A listing authorizes the service it names and nothing else — the same
IACA asked about a PID is refused, and the message says what it _is_ listed for:

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

## 2. The wallet is asked for a name. May this verifier ask for it?

Now the question runs the other way — not about the issuer, but about the party doing the asking. A
relying party registers, up front, which claims it intends to request and why; the wallet checks the
request against that registration before showing anything.

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

Same operation as §1, different authority — so `entity_id`, `action` and `resource` all speak the
registrar's vocabulary instead of the Trusted List's. Routing on `authority_id` is what frees the
caller from knowing which of the two it is talking to.

**A claim that was never registered.** DemoBank registered PID claims only, so asking for driving
privileges is refused:

```bash
curl -sX POST localhost:3000/authorization -H 'content-type: application/json' -d '{
  "entity_id": "DEMO.87654321",
  "authority_id": "https://dev.api.hopae.com/registrar/registry",
  "action": "request",
  "resource": "mso_mdoc/driving_privileges"
}'
# → "authorized": false
```

The registrar signs negative answers too, which is what lets the resolver return this as a decision
rather than an error.

## 3. Hold on — who says that registrar gets to answer §2?

§2 is only as good as the registrar behind it. This is the question authorization cannot ask, and the
reason recognition exists: _is this an authority whose answers count?_

The key below is the Registrar CA, which `demo.sh` reads from the live registrar before asking — so
the query is about the key the registrar actually signs with, not one copied from this page.

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

**An authority for something else is not an authority for this.** The mDL issuer from §1 is on the
Trusted List, but as an issuer. Asked as a registrar, it is refused — and the trailing clause is the
difference between "wrong authority" and "key I have never seen":

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

A key on no list at all also answers false, with no trailing clause — try
`x509:ski:deadbeefdeadbeefdeadbeefdeadbeefdeadbeef`.

## 4. The request arrived through an intermediary

Relying parties often do not talk to wallets themselves; a platform fronts for them. Before honouring
a request made on someone's behalf, the wallet has to know the delegation is real.

This stretches recognition a little: canonically the peer being recognized is another trust registry,
whereas an intermediary is a party acting in a delegated capacity. It is modelled as recognition
because the question has the same shape — _do you accept this party in this role_ — but it is a
modelling choice, not something TRQP prescribes.

```bash
curl -sX POST localhost:3000/recognition -H 'content-type: application/json' -d '{
  "entity_id": "urn:eudi:rp:HOPAE-DEMO-INTERMEDIARY-LU-01",
  "authority_id": "https://dev.api.hopae.com/registrar/registry",
  "action": "mediate",
  "resource": "HOPAE-DEMO-MEDIATED-RP-LU-01"
}'
# → "recognized": true, "message": "… registered … as its intermediary"
```

**Delegation is per relying party, not a badge.** The same intermediary against a verifier that never
appointed it:

```bash
curl -sX POST localhost:3000/recognition -H 'content-type: application/json' -d '{
  "entity_id": "urn:eudi:rp:HOPAE-DEMO-INTERMEDIARY-LU-01",
  "authority_id": "https://dev.api.hopae.com/registrar/registry",
  "action": "mediate",
  "resource": "HOPAE-DEMO-VERIFIER-LU-01"
}'
# → "recognized": false, "message": "… did not register … as its intermediary"
```

## 5. An authority nobody claims

Routing is owned by the adapters; when none is authoritative the resolver says so rather than
guessing.

```bash
curl -sX POST localhost:3000/authorization -H 'content-type: application/json' -d '{
  "entity_id": "x", "authority_id": "https://unknown.example",
  "action": "issue", "resource": "mDL"
}'
# → 404 application/problem+json, "title": "NoAdapterError"
```

---

## Query vocabulary

`authority_id` selects the adapter; the rest is that trust source's own vocabulary.

**Trusted List** — `authority_id: https://trusted-list.vercel.app`

| Field       | Accepted values                                                                                                                                                                                                                          |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_id` | `x509:ski:<hex>`, `x509:sha256:<hex>`, or an entity name / trade name / information URI / subject DN                                                                                                                                     |
| `action`    | `issue` for `…/Issuance/…` services, `register` for `…/Registration`                                                                                                                                                                     |
| `resource`  | a full service-type URI, one of its segments (`mDL`, `PID`, `SD-JWT-VC`, `mirrored-iaca`, …), or a credential type that aliases to one (`org.iso.18013.5.1.mDL`, `eu.europa.ec.eudi.pid.1`, `urn:eudi:pid:1`, `org.iso.23220.photoid.1`) |

**Registrar** — `authority_id: https://dev.api.hopae.com/registrar/registry`

| Field       | Accepted values                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity_id` | the registered identifier (`HOPAE-DEMO-VERIFIER-LU-01`), or — where TRQP requires a URI — `urn:eudi:rp:<identifier>` or `<registryURI>/wrp/<identifier>` |
| `action`    | `request` / `present` (authorization), `mediate` (recognition)                                                                                           |
| `resource`  | authorization: `<format>/<claim>` or `<claim>` · recognition: the relying-party identifier the intermediary acts for                                     |

Point the adapters at another deployment with `TRUSTED_LIST_URL`, `TRUSTED_LIST_SO_CERT_SHA256`,
`REGISTRAR_REGISTRY_URL` and `REGISTRAR_TRUST_ANCHOR_URL` (see `apps/resolver/src/adapters/adapters.module.ts`).

## What is and is not checked

Verified on every query:

- each Trusted List's JAdES signature, against the **pinned** Scheme Operator certificate — an
  unpinned signature would only prove that somebody signed the list;
- each registrar response's JWS signature, and that its signer chains to the Registrar CA as
  republished by the Scheme Operator;
- signer certificate validity windows, the registrar response's `exp`, and the JWS `alg`/`crit`
  headers (`alg: none`, an unknown `crit`, or `b64: false` are rejected rather than ignored).

Deliberately out of scope for this PoC — each is a decision the resolver currently does not make:

- **Chaining the two questions.** §3 licenses §2, but the resolver does not enforce that: a client
  gets an authorization answer whether or not it asked the recognition question first.
- **Revocation.** No CRL or status-list check on the listed anchors or on relying-party access
  certificates; a revoked-but-registered party still resolves.
- **List freshness.** A list's `nextUpdate` is not enforced, so a stale-but-signed list is accepted.
- **Doctype scoping on claims.** The registrar's `check-intended-use` compares its `credentialmeta`
  parameter against an object, so it never matches and cannot be used. The adapter therefore filters
  on format and claim-path segment only: `mso_mdoc/given_name` is satisfied by a `given_name`
  registered under _any_ mdoc doctype. Scoping to a doctype needs a fix in the registrar.
- **Cache TTL.** Adapters report a `freshUntil` but `ResolverService` still caches every decision for
  a flat 60 s.
- **Historical queries.** `context.time` is echoed back as `time_requested`, never used to evaluate a
  query as-of a past time.
