---
title: EU Trusted Lists
sidebar_position: 1
---

# EU Trusted List adapter

`libs/adapter-eu-trusted-list` bridges TRQP onto the eIDAS trusted lists: the
European Commission's **List of Trusted Lists (LoTL)** and the national
**trusted lists (TL)** it points to, in the XML format of
**ETSI TS 119 612** (TLv5 and TLv6 / v2.3.1+ are both parsed).

A trusted list says which **trust services** (a CA issuing qualified
certificates, a qualified time-stamping authority, …) a supervisory body lists,
under which **status**, since when, and for what **usage**. The adapter turns a
TRQP query into exactly that lookup.

## Query mapping

| TRQP field | Meaning for this adapter | Examples |
|------------|--------------------------|----------|
| `authority_id` | URL of a trusted list: a configured LoTL / TL, or a national TL the loaded LoTL points to | `https://ec.europa.eu/tools/lotl/eu-lotl.xml` |
| `entity_id` | the trust service (or TSP) being asked about | see below |
| `resource` | `ServiceTypeIdentifier` — short name after `…/Svctype/`, full URI, or `*` | `CA/QC`, `TSA/QTST` |
| `action` | `AdditionalServiceInformation` usage — short name after `…/SvcInfoExt/`, full URI, or `any` / `*` | `ForeSignatures`, `ForeSeals`, `ForWebSiteAuthentication` |
| `context.time` | evaluation time, resolved against `ServiceHistory` (default: now) | `2021-03-01T00:00:00Z` |

### `entity_id` forms

| Form | Matches |
|------|---------|
| `x509:cert:<base64 DER>`, a PEM certificate, or bare base64 `MII…` | a service whose certificate **is** this certificate (SHA-256 or SKI), **or** that **directly issued** it — names chain *and* the signature verifies with the listed CA key; the certificate must be valid at the evaluation time |
| `x509:ski:<base64 or 20-byte hex>` | a service by subject key identifier (also matches `X509SKI` in history) |
| `x509:sha256:<hex>` | a service certificate by SHA-256 fingerprint |
| `tsp:<name>` | any service of a TSP by `TSPName` / `TSPTradeName` (case-insensitive). `tsp:VATDE-…` / `tsp:NTRFI-…` only downloads that territory's list |

### Decision

`authorized: true` iff some service on the list(s)

1. is identified by `entity_id`, and at the evaluation time
2. has the requested service type,
3. declares the requested usage, and
4. has a positive status — `granted`, `recognisedatnationallevel`, or one of
   the pre-2016 values (`undersupervision`, `supervisionincessation`,
   `accredited`, `setbynationallaw`).

The `message` names the list, TSP, service, status and how the entity matched
(or up to three reasons for a denial). `evidence` (logged, not returned) records
every list consulted: territory, sequence number, `NextUpdate`, whether the
signature was verified.

### Recognition

A LoTL **recognizes** a national trusted list iff it contains an
`OtherTSLPointer` to it (`entity_id` = TL URL). `action` / `resource` are not
interpreted. Asking a national TL to recognize something is `501`.

## Examples

```http
POST /authorization
{
  "authority_id": "https://ec.europa.eu/tools/lotl/eu-lotl.xml",
  "entity_id": "x509:cert:MIIF…",
  "resource": "CA/QC",
  "action": "ForeSignatures",
  "context": { "time": "2025-11-03T09:00:00Z" }
}
```

```http
POST /recognition
{
  "authority_id": "https://ec.europa.eu/tools/lotl/eu-lotl.xml",
  "entity_id": "https://dp.trustedlist.fi/fi-tl.xml",
  "resource": "trusted-list",
  "action": "recognize"
}
```

## Routing, loading and caching

- `order: 90` — after prefix-matched DID adapters, before well-known probes.
- `canHandle` is `false` for anything that is not `http(s)` (no I/O) and `true`
  for configured sources (no I/O). For another `http(s)` authority the LoTL is
  loaded once so its pointers can be checked; if that load fails the registry
  answers `503` unless another adapter matches.
- Lists are fetched lazily, parsed once, and cached until
  `min(NextUpdate, maxCacheAgeMs)` (default 6 h); that time is returned as
  `freshUntil`. Concurrent requests share one download, failures back off for
  `retryAfterFailureMs`, and a failed refresh keeps serving the previous
  snapshot while its `NextUpdate` has not passed.
- A LoTL-level query downloads the national XML lists (PDF pointers are
  skipped) with bounded concurrency. If some list could not be loaded and
  nothing matched, the answer is `503` — a denial cannot be given honestly.
  Set `onListUnavailable: 'ignore'` to deny instead.
- The default fetcher only accepts `https:`, caps size (32 MB) and time (15 s),
  and follows redirects only within the same origin. Documents with a
  `DOCTYPE` are rejected.

## Signature verification

Trusted lists are XAdES-signed. Verification is a **pluggable hook** and is
**off by default**:

```ts
export interface TrustedListSignatureVerifier {
  readonly id: string;
  verify(xml: string, ctx: TrustedListSignatureContext): Promise<SignatureCheck>;
}
```

`ctx.expectedSigners` carries the certificates the signer must match: the
pinned `signingCertificates` of a configured source (for the EU LoTL: the
certificates published in the Official Journal), or, for a national list, the
certificates in the LoTL's `OtherTSLPointer`. While no verifier is configured
every answer carries `[list signature not verified]` in its `message`.

```ts
EuTrustedListAdapterModule.forRoot({
  sources: [{ url: EU_LOTL_URL, kind: 'lotl', signingCertificates: [/* OJ pins */] }],
  signatureVerifier: myXadesVerifier,
  requireSignatureVerification: true, // lists that fail verification are unusable
});
```

## Configuration

`EuTrustedListAdapterModule.forRoot()` with no options serves the EU LoTL.

| Option | Default | |
|--------|---------|--|
| `sources` | `[{ url: EU_LOTL_URL, kind: 'lotl' }]` | `kind: 'tl'` adds a standalone trusted list |
| `signatureVerifier` | no-op | see above |
| `requireSignatureVerification` | `false` | startup error without a verifier |
| `maxCacheAgeMs` | `21600000` (6 h) | |
| `retryAfterFailureMs` | `60000` | |
| `onListUnavailable` | `'error'` | `'ignore'` → deny instead of 503 |
| `loadConcurrency` | `6` | |
| `fetcher` / `http` | HTTPS fetcher | custom transport, or `{ timeoutMs, maxBytes, allowInsecureHttp }` |

### Environment variables

The resolver builds the options with `euTrustedListOptionsFromEnv()`, so the
list of trusted lists can be changed without touching code — e.g. to run
against a local mirror when the EU site is unreachable:

| Variable | Effect |
|----------|--------|
| `TRS_EU_LOTL_URL` | serve this list of trusted lists instead of the EU LoTL; the value is used verbatim as the `authority_id` |
| `TRS_EU_TL_ALLOW_HTTP` | `true` accepts plain `http://` lists (local testing only) |

```bash
TRS_EU_LOTL_URL=http://localhost:8080/eu-lotl.xml TRS_EU_TL_ALLOW_HTTP=true pnpm start
```

An `http://` URL without `TRS_EU_TL_ALLOW_HTTP`, or a malformed URL, stops the
app at startup rather than showing up later as an unavailable list.

## Not in scope (yet)

- XAdES signature validation itself (the hook is ready).
- Full qualification determination per ETSI TS 119 615 (`Qualifications`
  extension criteria, QC statements, revocation, multi-level chains). The
  `issued-by` match covers one issuance step only.
- ETSI TS 119 602 lists of trusted entities (EUDI Wallet: PID providers, wallet
  providers, access certificate authorities) — a natural next adapter on top
  of the same store and evaluator shape.
