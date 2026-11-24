# Contributing

## Branches and pull requests

Every feature or fix goes on its own branch off `main` (`feat/<name>`, `fix/<name>`, `chore/<name>`) and is merged through a pull request.

## Commits

- Messages follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`, e.g. `feat(web): ...`, `fix(api): ...`. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `ci`. Breaking changes get a `!` (`feat(api)!: ...`).
- The pre-commit hook runs `vp check --fix` on the staged files, so it can rewrite them or stop the commit.

## Versions

The project has one version, in the root `package.json`, following [SemVer](https://semver.org). Apps and packages have none, and there are no git tags or GitHub releases. While in alpha (`0.x`), each branch bumps it by what it contains:

- A `feat` or a breaking change bumps the minor version (`0.1.0` → `0.2.0`).
- Only fixes bump the patch version (`0.1.0` → `0.1.1`).
- Anything else (`docs`, `chore`, `refactor` and so on) keeps it as is.
