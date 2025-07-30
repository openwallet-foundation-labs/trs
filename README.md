# TRS (Trust Resolver System)

A TypeScript implementation of the Trust Resolving System that follows Trust Registry Query Protocol (TRQP) to simplify trust information resolution across different trust protocols.

The TRS addresses the complexity of implementing trust resolver systems on the client side by providing a unified interface for various trust protocols including OpenID Federation, X.509 certificates, did:web and EBSI Trust Chains.

## Architecture

```
                                   +-------------+
                                   |             |
                                   | root server |
                                   |             |
                                   |             |
                                   +-------------+
                                       ↑      |
                   (not standardized)  |      |
                   who can process my  |      |
                         query?        |      |
                                       |      ↓
+-------------+      Query        +----------------+     Query      +--------------+
|             |      (TRQP)       |                |     (TRQP)     |              |
|   client    |------------------>| trust resolver |--------------->|trust registry|
|             |                   |                |                |              |
+-------------+                   +----------------+                +--------------+
```

## Features

- **Unified Trust Resolution**: Single interface for multiple trust protocols
- **TRQP Implementation**: Full TypeScript implementation of the Trust Registry Query Protocol
- **Client-Side Simplicity**: Easy-to-use API without requiring deep protocol knowledge
- **Extensible Architecture**: Support for adding new trust protocols

## Getting Started

### Installation

```bash
npm install trust-resolver
```

### Basic Usage

```typescript
import { TrustResolver } from "trust-resolver";

const resolver = new TrustResolver({
  resolver1: "x.x.x.x", // Primary resolver
  resolver2: "x.x.x.x", // Backup resolver
});
const trustInfo = await resolver.query({
  // Query parameters
});
```

## Project Status

This project is currently in the **Labs** maturity level under the OpenWallet Foundation.

## Contributing

We welcome contributions from the community! Please feel free to:

- Open issues to discuss ideas or report bugs
- Submit pull requests with improvements
- Participate in discussions

See our [Code of Conduct](https://tac.openwallet.foundation/governance/code-of-conduct/) for community guidelines.

## Maintainers

- [Lukas Han](https://github.com/lukasjhan) - Hopae Inc.
- [seorim](https://github.com/yunseorim1116) - Hopae Inc.

## License

This project is licensed under the Apache 2.0 License.

## Related Links

- [Trust Registry Query Protocol (TRQP)](https://trustoverip.github.io/tswg-trust-registry-protocol)

## Infrastructure

The project plans to deploy a distributed server infrastructure with primary and backup servers, similar to DNS resolver systems, accessible via IP address for reliable trust resolution services.
