# Contributing to TRS

Thanks for your interest in contributing! Issues and pull requests are welcome.
This project follows the
[OpenWallet Foundation Code of Conduct](https://tac.openwallet.foundation/governance/code-of-conduct/).

The full developer guide lives on the docs site:

- [Getting started](https://openwallet-foundation-labs.github.io/trs/contributing/getting-started): install, build, test, run
- [Adding an adapter](https://openwallet-foundation-labs.github.io/trs/contributing/adding-an-adapter)
- [Conventions](https://openwallet-foundation-labs.github.io/trs/contributing/conventions): commits, PRs, code style

## Quick start

```bash
pnpm install
pnpm build:core
cd trs
pnpm test
pnpm lint
```

## Before you open a pull request

- **Sign off every commit** (`git commit -s`). The DCO check is required to merge.
- Branch off `main` and keep the PR focused on one change.
- Add or update tests for behavioral changes, and update the docs in `website/`
  when you change behavior or configuration.
- CI runs lint, prettier, build and tests for the server and builds the docs
  site; make sure they pass locally first.
- Reference related issues (`Closes #17`).

## Finding something to work on

Issues labeled
[`good first issue`](https://github.com/openwallet-foundation-labs/trs/labels/good%20first%20issue)
are a good place to start; new trust-protocol adapters are especially welcome.
Comment on an issue before starting larger work so we can avoid duplicate effort.

## Security issues

Please do not report vulnerabilities in public issues. See
[SECURITY.md](SECURITY.md).
