---
title: Adding an adapter
sidebar_position: 2
---

# Adding a trust-protocol adapter

This is the most common contribution. An adapter is a self-contained Nest library
under `trs/libs/adapter-*`. Adding one requires **no changes to the resolver
core** — you write the adapter, register its module in one place, and the
registry discovers it automatically.

Use the existing [`adapter-did-web`](https://github.com/openwallet-foundation-labs/trs/tree/main/trs/libs/adapter-did-web)
and the reference `StaticAdapter` (in `adapter-kit`) as templates.

## 1. Create the library

```bash
cd trs
nest g library adapter-<name>
```

This creates `libs/adapter-<name>` and registers path aliases.

## 2. Implement the adapter

Implement `TrustProtocolAdapter` and decorate it with `@TrustAdapter(id, { order })`:

```ts
import { TrustAdapter } from '@app/adapter-kit';
import type {
  AuthorizationInput, AuthorizationOutcome,
  RecognitionInput, RecognitionOutcome,
  TrustProtocolAdapter,
} from '@app/adapter-kit';

@TrustAdapter('did:example', { order: 20 })
export class ExampleAdapter implements TrustProtocolAdapter {
  readonly id = 'did:example';

  async canHandle(authorityId: string): Promise<boolean> {
    // Reject cheaply before any I/O when the scheme can't match.
    if (!authorityId.startsWith('did:example:')) return false;
    return true; // or a well-known probe / list-membership / chain check
  }

  async resolveAuthorization(input: AuthorizationInput): Promise<AuthorizationOutcome> {
    // fetch + verify against your protocol, then map to a decision
    return { authorized: true, message: `resolved ${input.authorityId}` };
  }

  async resolveRecognition(input: RecognitionInput): Promise<RecognitionOutcome> {
    return { recognized: true };
  }
}
```

### Picking `order`

`order` decides evaluation priority (smaller = earlier). Put cheap, unambiguous
matchers first:

- prefix-only DID methods (no I/O): ~`10`
- network probe / data-lookup adapters: ~`100`

Always make `canHandle` return `false` **before** any network call when the
scheme obviously doesn't match — this keeps sequential routing cheap. Throw only
on a genuine failure to determine (e.g. the network is down); that becomes a
`503` rather than a silent miss.

## 3. Wrap it in a module

```ts
import { Module } from '@nestjs/common';
import { ExampleAdapter } from './example.adapter';

@Module({
  providers: [ExampleAdapter],
  exports: [ExampleAdapter],
})
export class ExampleAdapterModule {}
```

## 4. Register it — the one wiring line

Add the module to `apps/resolver/src/adapters/adapters.module.ts`. **This is the
single place adapters are registered** — the resolver core stays untouched:

```ts
@Module({
  imports: [
    DidWebAdapterModule,
    ExampleAdapterModule, // 👈 your adapter
  ],
})
export class AdaptersModule {}
```

The `AdapterRegistry` auto-discovers the `@TrustAdapter` provider at startup and
slots it into the order-based routing.

## 5. Test it

Cover the two things that matter:

- **Routing** — `canHandle` returns `true`/`false` for the right authorities, and
  the registry selects your adapter (respecting `order`).
- **Resolution** — `resolveAuthorization` / `resolveRecognition` map protocol
  results to the right decision.

Run the suite with `pnpm test` from `trs/`.

## Checklist

- [ ] `libs/adapter-<name>` with a `TrustProtocolAdapter` + `@TrustAdapter`
- [ ] `canHandle` rejects other schemes before any I/O
- [ ] a sensible `order`
- [ ] an `*AdapterModule` added to `AdaptersModule`
- [ ] tests for routing and resolution
