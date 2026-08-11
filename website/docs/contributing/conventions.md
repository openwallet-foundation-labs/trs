---
title: Conventions
sidebar_position: 3
---

# Project conventions

## Commits & sign-off

- Keep commit messages concise; a short imperative subject (e.g.
  `feat: add did:webvh adapter`) plus optional bullet points.
- **Sign off every commit** (Developer Certificate of Origin):

  ```bash
  git commit -s -m "feat: add did:webvh adapter"
  ```

  This appends a `Signed-off-by:` trailer with your name and email from your git
  config.

## Pull requests

- Branch off `main`, open the PR against
  [`openwallet-foundation-labs/trs`](https://github.com/openwallet-foundation-labs/trs).
- Reference related issues in the description (`Refs #14`, `Closes #27`, …).
- Keep the PR focused; describe what changed and why, briefly.
- Make sure the test suite passes and the build is green.

## Code style

- TypeScript throughout.
- The server (`trs`) uses ESLint + Prettier; the client SDK uses Biome. Run the
  package's `lint`/`format` scripts before pushing.
- Prefer small, self-contained modules — this is why adapters are their own
  libraries.

## Tests

- Add tests with every behavioral change.
- Adapters should test both **routing** (`canHandle` / registry selection) and
  **resolution**.

## Architecture decisions

Bigger design choices (routing strategy, validation approach, etc.) are captured
on the [issues](https://github.com/openwallet-foundation-labs/trs/issues) and in
the [How it works](../how-it-works/overview.md) section. When a change alters one
of those decisions, note it in the PR so the reasoning stays discoverable.
