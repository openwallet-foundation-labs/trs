---
title: Design Rationale of the Trust Resolver System
description: Why TRS places a TRQP-speaking resolver between clients and trust registries, and the trade-offs behind its discovery, adapter, and deployment choices.
---

# Design Rationale of the Trust Resolver System

## Summary

Wallets, verifiers, and issuers need to answer one practical question: *can I trust this party for this purpose?* The evidence lives in very different places depending on the ecosystem: OpenID Federation trust chains, X.509 certificate hierarchies, `did:web` documents, or EBSI trust chains. Supporting each of them on the client side is costly and error-prone.

The Trust Resolver System (TRS) is a TypeScript implementation of a trust resolving system that follows the Trust Registry Query Protocol (TRQP). Clients send a TRQP query to a trust resolver, and the resolver forwards it to the trust registry that can answer it. A separate, deliberately non-standardized discovery step (the root server) tells the resolver which registry to ask. This report records *why* TRS is shaped this way: the problem it targets, its goals and non-goals, the key design decisions with their alternatives and trade-offs, and the questions that remain open.

:::note
This report explains design rationale. For how TRS works and how to contribute, see the [Docs](https://openwallet-foundation-labs.github.io/trs/).
:::

*Terminology.* The project uses both "Trust Resolver System" and "Trust Resolving System". This report uses "Trust Resolver System (TRS)" for the project and "trust resolver" for the component that receives client queries.

## 1. Background and Motivation

### 1.1 Fragmented trust infrastructure

Different ecosystems have converged on different mechanisms for establishing who is authorized to do what:

- **OpenID Federation**: trust is established by resolving and validating a chain of entity statements up to a trust anchor.
- **X.509**: trust is established by validating a certificate path against a set of trusted roots.
- **did:web**: trust information is published in a DID document hosted under a domain.
- **EBSI trust chains**: trust is anchored in the registries and accreditation structure of the EBSI ecosystem.

Each mechanism is sound within its own ecosystem. The difficulty appears at the boundary: a wallet or verifier that works across ecosystems must implement and maintain several resolution flows, each with its own data formats, validation rules, and failure modes.

### 1.2 The client-side burden

Without a shared abstraction, every wallet and verifier repeats the same integration work. The cost is not only development effort: divergent implementations of validation logic also produce inconsistent trust decisions for the same input. TRS exists to move this complexity out of each client and into one reusable component, so that clients can use a simple API without deep knowledge of each protocol.

### 1.3 Project context

TRS was proposed as an OpenWallet Foundation lab project and was approved by the Technical Advisory Council in May 2025. Early TAC discussion focused on the infrastructure needed to run resolver servers, for demonstrations or as resolver infrastructure, including service-level expectations. That concern shaped one of the decisions below: a resolver is not only a library but potentially a service that must be reachable and reliable.

## 2. Scope and Non-Goals

**In scope**

- A unified query interface for clients, aligned with TRQP.
- A resolver that forwards TRQP queries to trust registries.
- Support for additional trust protocols without changing the client-facing interface.

**Non-goals**

- TRS does not replace the trust frameworks it resolves against. Each ecosystem keeps its own governance and trust model.
- TRS does not define new trust semantics or a new trust framework.
- TRS does not standardize how a resolver discovers which registry can answer a query. The project treats this step as outside the standardized protocol.

## 3. Design Goals

1. **One interface, many protocols.** A client calls the same operation whether the underlying evidence comes from a federation, a PKI, a DID document, or an EBSI registry.
2. **Standards alignment.** The query model follows an open specification, TRQP, instead of a project-specific API, so that clients and registries from different vendors can interoperate.
3. **Preserve existing ecosystems.** Adoption does not require an ecosystem to change how it publishes or governs trust.
4. **Client-side simplicity.** Developers should not need deep protocol knowledge to resolve trust.
5. **Extensibility.** Supporting a new trust protocol is an additive change, not a redesign.
6. **Dependable resolution.** Resolution should remain available when a single server fails.

## 4. Architecture Overview

TRS separates three roles: the **client** that asks, the **trust resolver** that receives the query, and the **trust registry** that holds the authoritative answer. Client-to-resolver and resolver-to-registry traffic both use TRQP. A **root server** helps the resolver find which registry can process a query; this step is not standardized.

```text
                                 +-------------+
                                 | root server |
                                 +-------------+
                                     ^      |
                 (not standardized)  |      |
                 who can process     |      |
                 my query?           |      v
+--------+   TRQP query    +----------------+   TRQP query   +----------------+
| client |---------------->| trust resolver |--------------->| trust registry |
+--------+                 +----------------+                +----------------+
```

Existing trust frameworks such as OpenID Federation, X.509, did:web, and EBSI do not speak TRQP natively. Adapters bridge them: an adapter answers TRQP queries on behalf of a configured trust framework, so that the resolver and the client see one protocol.

## 5. Key Design Decisions

### 5.1 Adopt TRQP as the query contract

**Decision.** TRS follows TRQP for both client-to-resolver and resolver-to-registry queries.

**Rationale.** TRQP is a lightweight, read-only protocol for querying authoritative data from trust registries, often compared to DNS for digital trust ecosystems. Non-normative implementer guidance stresses that TRQP is a *bridge across* trust frameworks rather than a replacement for them, and that it answers one question: whether an entity holds a given authorization in the context of a given ecosystem governance framework. This matches the problem TRS targets and gives it a community-reviewed vocabulary instead of a bespoke API.

**Alternatives considered.**

- *A project-specific API.* Faster to shape, but it locks clients into TRS and forces every registry to adapt to a TRS-only contract.
- *Per-protocol client libraries with no common interface.* Simple for each library, but it leaves the client-side burden in Section 1.2 unsolved.

**Trade-offs.** TRQP deliberately does not specify how a bridge to a given ecosystem is built, nor how a query finds the right registry. TRS must decide both (see 5.2 to 5.4), and its behavior is bounded by what TRQP can express.

### 5.2 Place a resolver between client and registry

**Decision.** Clients query a trust resolver rather than contacting registries directly.

**Rationale.** A resolver gives clients a single endpoint and a single query format, in the same way a DNS resolver spares applications from walking the name hierarchy themselves. Client code stays simple, and routing and protocol knowledge live in one maintained component.

**Trade-offs.** The resolver becomes a shared dependency. Clients must trust the resolver, and its availability and correctness affect every client that relies on it (see Section 6).

### 5.3 Keep registry discovery outside the standardized protocol

**Decision.** Finding out which registry can process a query is handled by a root server, and this step is explicitly marked as not standardized.

**Rationale.** TRQP defines how to ask a registry a question, not how to find the registry that should be asked. Leaving discovery open lets the project start with a simple mechanism without claiming a standard for something no specification yet covers.

**Alternatives considered.** Defining a discovery protocol inside TRS would have made the project responsible for a standardization problem beyond its scope. Statically configuring registries in every client would push the discovery burden back onto clients.

**Trade-offs.** Until discovery is standardized, different resolvers may find registries in different ways, which limits portability between resolver deployments.

### 5.4 Bridge existing frameworks with adapters

**Decision.** Each supported trust framework is handled by an adapter that answers TRQP queries for that framework.

**Rationale.** Because TRQP leaves the bridge to the implementer, protocol-specific logic belongs in a component of its own. Isolating it keeps the resolver and client interface stable, and makes a new protocol an additive change (Goal 5). For example, an X.509 adapter proposed in the repository (PR #33) treats a certificate as authorized when it chains to one of the configured trust anchors under RFC 5280 path validation, nothing on the path is revoked according to CRLs, and the leaf allows the requested key usage. An adapter for EU trusted lists is mentioned in the same discussion.

**Trade-offs.** A unified result is only as expressive as the common denominator of what the underlying frameworks can provide. Some protocol-specific evidence may not be representable in a TRQP response. Adapters also take on validation logic, so their correctness directly affects trust outcomes.

### 5.5 Deploy resolvers like DNS resolvers

**Decision.** The project plans a distributed server infrastructure with primary and backup resolvers, reachable by IP address, similar to DNS resolver systems.

**Rationale.** A resolver that clients depend on must keep working when one server is unavailable. Following the DNS model gives clients a familiar pattern: configure a primary and a backup, and fall back when the first fails. The client API reflects this by accepting a primary and a backup resolver address.

**Trade-offs.** Operating public resolver infrastructure brings service-level, governance, and cost questions that a pure library does not have. These were raised during the TAC review of the project proposal.

### 5.6 Provide a TypeScript client library

**Decision.** TRS is implemented in TypeScript and published as an npm package, `trust-resolver`. A client creates a `TrustResolver` with its resolver addresses and calls `query()`.

**Rationale.** The package targets wallet and verifier developers who already work in the JavaScript and TypeScript ecosystem, and supports the client-side simplicity goal.

## 6. Trade-offs and Limitations

- **Abstraction cost.** A unified interface hides protocol differences. That helps clients, but can hide protocol-specific evidence that some relying parties need.
- **Shared dependency.** Clients rely on the resolver for correct answers. A compromised or misconfigured resolver, registry, or adapter can affect every client that trusts it.
- **Unstandardized discovery.** Until the root-server step is standardized, resolver deployments may not be interchangeable.
- **Dependence on upstream specifications.** TRS inherits both the strengths and the evolution risk of TRQP and of each underlying trust protocol.
- **Operational responsibility.** Hosted resolvers raise availability, latency, and governance concerns of their own.

## 7. Open Questions

- Should discovery be standardized, and if so, where should that specification live?
- How should a resolver represent partial or conflicting evidence when different registries answer differently for the same entity?
- What is the right boundary between resolving trust information and evaluating relying-party policy over it?
- What is the threat model for the resolver, root server, and adapters, and which guarantees does TRS make to clients?

## 8. References

- Trust Registry Query Protocol (TRQP) specification, Trust Over IP Foundation: https://trustoverip.github.io/tswg-trust-registry-protocol
- TRS repository and README: https://github.com/openwallet-foundation-labs/trs
- TRS project page, OpenWallet Foundation: https://openwallet.foundation/projects/trs-trust-resolver-system/
- X.509 PKI adapter proposal, TRS pull request 33: https://github.com/openwallet-foundation-labs/trs/pull/33
- OpenWallet Foundation TAC meeting minutes, 14 May 2025 (TRS approved as a lab project): https://tac.openwallet.foundation/meetings/2025/2025-05-14
- TRQP User Guide (non-normative implementer companion): https://gist.github.com/andorsk/a7fcfa75d178f51cbe6dd9cc9224b772
