# Contributing

## Workflow

1. Every change starts with an issue: a bug report or a feature request.
2. Work on a branch named after the issue. `gh issue develop <issue> --checkout`
   creates `<issue>-<title>`.
3. Open a pull request against `main`. The _Tickets_ check links the issue
   (`Closes #<issue>`); a pull request without a ticket fails.
4. CI runs on every pull request. When all checks are green, _Auto-merge_
   squash-merges it. Open the pull request as a draft while it is not ready.
5. The merge closes the issue. `main` always holds the latest valid state
   (trunk-based development).

## Versions and releases

- Versions follow [Semantic Versioning](https://semver.org) and exist only as
  git tags (`vMAJOR.MINOR.PATCH`).
- CI tags every merge to `main` with the next patch version.
- A release bundles the changes since the previous one: run
  _Actions → Release → Run workflow_ and pick `minor` or `major`. It tags
  `main` and publishes a GitHub release listing the merged pull requests and
  closed tickets.

## Development

Requirements: Node.js ≥ 22.13 (CI uses the version in [`.nvmrc`](.nvmrc)) and Python ≥ 3.12.

```bash
npm install                     # dev dependencies: pdfjs-dist (test harness), Biome
pip install -r requirements-dev.txt   # Ruff

python3 build.py                # rebuild dist/index.html (committed; CI checks it is current)
npx biome ci . && ruff check . && ruff format --check .
npm test                        # unit tests
node test/fetch.js              # download the reference corpus PDFs
node test/validate.js test/samples --jitter 2>/dev/null   # corpus assertions + jitter test
```

See [TESTING.md](TESTING.md) for the test harness and how to add a new certificate layout.
