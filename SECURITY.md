# Security Policy

TRS makes trust decisions, so we take vulnerability reports seriously.

## Reporting a vulnerability

**Please do not open a public issue.** Report privately through GitHub:

1. Go to the repository's [Security tab](https://github.com/openwallet-foundation-labs/trs/security).
2. Click **Report a vulnerability**.

Include what you can: affected component (resolver, a specific adapter, client
SDK), version or commit, steps to reproduce, and the impact you expect (for
example, a query being authorized when it should not be).

The maintainers will acknowledge the report, keep you updated while it is
investigated, and credit you in the advisory unless you prefer otherwise.

## Supported versions

TRS is pre-1.0. Fixes land on `main`; there are no maintained release branches
yet.

## Scope

Of particular interest:

- Trust decisions that can be forced to the wrong answer (signature or chain
  validation bypasses, cache confusion between queries, routing to the wrong
  adapter).
- Fetching behavior that can be abused (SSRF, unbounded downloads, plain-HTTP
  downgrade).
- Denial of service through crafted queries or trust data.
