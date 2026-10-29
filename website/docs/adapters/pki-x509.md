---
title: PKI (X.509)
sidebar_position: 2
---

# PKI (X.509) adapter

`libs/adapter-pki-x509` bridges TRQP onto a classic X.509 PKI: a certificate is
trusted by an authority iff it chains to one of the authority's **trust
anchors** under the path validation rules of **RFC 5280**, and no certificate
on the path is revoked.

## Query mapping

| TRQP field | Meaning for this adapter | Examples |
|------------|--------------------------|----------|
| `authority_id` | id of a configured PKI (its trust anchors) | `https://pki.example.com`, `urn:example:pki` |
| `entity_id` | the end-entity certificate, optionally with intermediates | see below |
| `resource` | required extended key usage — short name, OID, or `*` | `serverAuth`, `clientAuth`, `1.3.6.1.5.5.7.3.4` |
| `action` | required key usage, or `any` / `*` | `digitalSignature`, `keyAgreement` |
| `context.time` | validation time for validity periods and revocation dates (default: now) | `2027-06-01T00:00:00Z` |

### `entity_id` forms

| Form | Meaning |
|------|---------|
| `x509:cert:<base64 DER>` or bare base64 `MII…` | one certificate |
| `x509:x5c:<base64 DER>,<base64 DER>,…` | leaf first, then intermediates (like a JOSE `x5c`) |
| one or more PEM certificates | leaf first, then intermediates |

Intermediates in `entity_id` are untrusted: they are only used to build a path
to a configured trust anchor.

### Decision

`authorized: true` iff a path from the leaf to a trust anchor exists where

1. every certificate is valid at the evaluation time,
2. every issuer is a CA (`basicConstraints`), may sign certificates
   (`keyUsage: keyCertSign`, if present), and its `pathLenConstraint` holds,
3. no certificate below the anchor has a critical extension the adapter does
   not process (e.g. certificate policies, name constraints),
4. no certificate below the anchor is revoked at the evaluation time, and
5. the leaf allows the requested key usage and extended key usage (an absent
   extension does not restrict, as in RFC 5280; `anyExtendedKeyUsage` matches
   every EKU).

The `message` names the leaf and the anchor it chains to (or up to three
reasons for a denial). `evidence` (logged, not returned) records the chain and
the CRLs used. `freshUntil` is the earliest of the chain's `NotAfter` and the
CRLs' cache expiry.

### Recognition

A PKI **recognizes** a CA certificate (`entity_id`) iff it is a CA and chains
to one of the authority's trust anchors under the same rules. `action` /
`resource` are not interpreted.

## Examples

```http
POST /authorization
{
  "authority_id": "https://pki.example.com",
  "entity_id": "x509:x5c:MIIB…,MIIB…",
  "resource": "serverAuth",
  "action": "digitalSignature"
}
```

```http
POST /recognition
{
  "authority_id": "https://pki.example.com",
  "entity_id": "x509:cert:MIIB…",
  "resource": "*",
  "action": "any"
}
```

## Revocation

Each certificate below the anchor is checked against a **CRL signed by its
issuer**: a configured CRL first, otherwise the `http(s)` URLs in its CRL
distribution points. CRLs are cached until `min(NextUpdate, maxCrlCacheAgeMs)`,
concurrent requests share one download, and failures back off for
`retryAfterFailureMs`. A CRL past its `NextUpdate`, signed by another key, or
carrying critical extensions the adapter does not process (delta CRLs, issuing
distribution points, indirect CRLs) is never used.

If a certificate names CRLs but none can be used, the answer is `503`; set
`onRevocationUnavailable: 'ignore'` to treat it as not revoked (the `message`
then says `revocation not checked`). Certificates without any CRL source are
not checked unless `requireRevocationInfo` is set. OCSP is not supported yet.

## Configuration

```ts
PkiX509AdapterModule.forRoot({
  authorities: [
    {
      id: 'https://pki.example.com',
      trustAnchors: [rootPem],
      intermediates: [issuingCaPem],
      crls: [issuingCaCrlPem], // optional
    },
  ],
});
```

The resolver reads authorities from the JSON file named by `TRS_PKI_CONFIG`
(same shape as `authorities` above; entries are inline PEM or paths relative to
the file). Without it the adapter has no authorities and never matches.

| Option | Default | |
|--------|---------|--|
| `authorities` | `[]` | `authority_id` → trust anchors, intermediates, CRLs |
| `fetchCrls` | `true` | fetch CRLs from distribution points |
| `onRevocationUnavailable` | `'error'` | `'ignore'` → treat as not revoked instead of 503 |
| `requireRevocationInfo` | `false` | deny certificates without any CRL source |
| `maxCrlCacheAgeMs` | `86400000` (24 h) | |
| `retryAfterFailureMs` | `60000` | |
| `maxIntermediates` | `8` | |

## Routing

`order: 50` — after prefix-matched DID adapters, before the EU trusted list
adapter. `canHandle` is a lookup of the configured authority ids (no I/O).
