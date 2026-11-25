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

## Status

TRS is pre-1.0 and under active development. The resolver server implements the
TRQP v2.0 HTTPS binding (`POST /authorization`, `POST /recognition`) and routes
each query to a trust-protocol adapter.

| Adapter | Status |
| --- | --- |
| [EU Trusted Lists](https://openwallet-foundation-labs.github.io/trs/adapters/eu-trusted-list) (ETSI TS 119 612) | Available |
| [PKI / X.509](https://openwallet-foundation-labs.github.io/trs/adapters/pki-x509) | Available |
| did:web | In progress ([#17](https://github.com/openwallet-foundation-labs/trs/issues/17)) |
| OpenID Federation, did:webvh, did:webs | Planned ([#20](https://github.com/openwallet-foundation-labs/trs/issues/20), [#18](https://github.com/openwallet-foundation-labs/trs/issues/18), [#19](https://github.com/openwallet-foundation-labs/trs/issues/19)) |

The client SDK (`trust-resolver`, [#15](https://github.com/openwallet-foundation-labs/trs/issues/15))
is not published yet.

## Getting Started

### Run the resolver

With Docker:

```bash
docker build -t trs-resolver .
docker run --rm -p 3000:3000 trs-resolver
```

Or from source (Node.js 20+, pnpm 10):

```bash
pnpm install
pnpm build:core
cd trs && pnpm start
```

### Query it

```bash
curl -s -X POST http://localhost:3000/authorization \
  -H 'content-type: application/json' \
  -d '{
    "entity_id": "x509:cert:<base64 DER>",
    "authority_id": "https://ec.europa.eu/tools/lotl/eu-lotl.xml",
    "action": "ForeSignatures",
    "resource": "CA/QC"
  }'
```

This asks whether the certificate is issued by a qualified CA for e-signatures
on the EU trusted lists. The response is a TRQP authorization response (`authorized`, echoed query
fields, `time_evaluated`). Errors are returned as RFC 7807 problem details.

See the [documentation](https://openwallet-foundation-labs.github.io/trs/) for
how routing and caching work, each adapter's query mapping, and
[configuration](https://openwallet-foundation-labs.github.io/trs/how-it-works/configuration).

## Contributing

We welcome contributions from the community! See [CONTRIBUTING.md](CONTRIBUTING.md)
to get set up, and [SECURITY.md](SECURITY.md) for reporting vulnerabilities. Please feel free to:

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

## Roadmap: infrastructure

The project plans to deploy a distributed server infrastructure with primary and backup servers, similar to DNS resolver systems, accessible via IP address for reliable trust resolution services.
