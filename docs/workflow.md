<!-- shared: structure — adapted from the Migz93 self-hosted app workflow -->

# Workflow Reference

## Branches And Checkouts

Use develop as the integration branch and main for stable releases. Start task branches from an up-to-date develop checkout and open PRs back to develop. Use feat/, fix/, chore/, ci/ or docs/ prefixes. Reserve PRs into main for an authorized release. The repository default is develop.

For the maintained SSH workflow, check the server and local branches and dirty state, then fast-forward the intended branch on both checkouts. Edit source and run dependency installation, app checks and tests as node in the on-demand GraphRelay devcontainer. Run authenticated Git commands and Docker builds on the host. Commit and push the task branch from the host, then fast-forward the same branch on the client. Keep machine-specific commands in LOCAL.md. A retained client checkout is optional; synchronize through GitHub before using it and preserve unrelated work.

## GitHub CLI Usage

Check the target branch and repository before running commands. Use `gh pr view`, `gh pr checks` and `gh run view` to inspect work. Target `develop` for normal work and `main` for an authorized release. Write multiline GitHub bodies in a file and pass `--body-file`.

## AI Sign-Off For GitHub Text

Identify the agent when it drafts PR descriptions, issue bodies or comments. Keep private evidence and credentials out of GitHub text.

## Pull Request Conventions

Use a semantic title and a structured description with **Summary**, **Changes**, and **Test Plan**. Call out changes to persistence, permissions, Microsoft behaviour, Docker or releases. Review the exact branch revision under discussion.

## Docker Pull Request Checks

CI runs type checks, tests and a production build. PRs compile the production image for AMD64 and ARM64 and exercise native startup with disposable storage. Pushes to `main` and `develop` run the native startup check. See [Testing](../TESTING.md) for the matching local procedure.

## CodeRabbit Review Process

[CodeRabbit configuration](../.coderabbit.yaml) follows the sibling repos and targets both `main` and `develop`. Review tooling relies on the GitHub app having repository access. For a requested review, inspect findings against the current revision and confirm proposed fixes against GraphRelay’s auth, data and integration boundaries.

## Cross-AI Review And Closeout

After checks pass, commit the task changes and follow the owner's cross-AI review process from the host checkout against the intended base and head. Resolve valid findings, obtain a clean delta after fixes, then a fresh clean full review. A moved base or rewritten history requires a fresh full review. Record exact revisions and private saved reviews in ignored `LOCAL.md`. Follow the owner's separate PR, CodeRabbit and merge gates; review clearance alone does not authorize merging.

When reviewing coordinated changes with the sibling apps, run CodeRabbit CLI reviews sequentially. Apply shared fixes to affected repos and clear their cross-AI delta and full reviews before resuming. Results apply only to the recorded revisions.

Follow [agent closeout](../AGENTS.md#close-out-work) at PR close or cancellation, including task resources, retained volumes and verified task branches.

## Dependabot

[Dependabot](../.github/dependabot.yml) checks npm, GitHub Actions and Docker daily. npm minor and patch updates are grouped. Actions updates are grouped. Docker tracks updates within the chosen Node major. Version updates target the repository default branch. Review dependency changes and their CI results before merging.

## Release Process

1. Prepare the agreed version bump to `package.json` and `package-lock.json` when the maintainer requests a release.
2. Run type checks, tests, the production build and disposable Docker checks. Promote the reviewed release changes from develop to main, then check startup, migrations, persistent data, auth and Microsoft integrations on the intended release commit.
3. Once the maintainer approves tagging, tag the intended commit in `main` as `vX.Y.Z`. The workflow publishes the versioned AMD64 and ARM64 images. Stable tags also update `latest`.
4. Review the Release Drafter draft and publish the release after confirming the expected images. Synchronize develop with the released main commit through a fast-forward where possible or a reviewed PR when the histories have diverged.

## Release Notes

Summarize user-visible changes, upgrade steps, fixes, security or maintenance, and Docker tags where applicable. Use the draft as a starting point and account for changes that landed directly on `main`.

## Security Findings

Verify whether a finding affects the actual app or workflow. Record the evidence and reason for a dismissal. See [Security Policy](../SECURITY.md) for scanners, availability and private vulnerability reporting.

## Implementation Expectations

- Run the checks in [Testing](../TESTING.md) and document any validation gaps.
- Log the failed operation without credentials or raw Microsoft responses.
- Use code comments for invariants, recovery paths and provider quirks.
- Document durable behaviour in the relevant topic page. Record live deployment details privately.
- Deploy only runtime-affecting changes under the candidate process. Repository tooling and documentation changes can be validated independently.

## PR Title And Release Automation

The Semantic PR check runs on `pull_request` events (opened, edited,
synchronize and reopened). It validates the title from the event payload without
checking out PR code, accessing secrets or requesting token permissions. Accepted
types are `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`,
`revert`, `style` and `test`; optional scopes and a breaking-change `!` are
supported. Keep the title accurate when reviewing and merging a PR.

The check runs the workflow from the PR merge ref, so a PR can change its own
formatting check. Review workflow edits and the final title before merging;
this check is a formatting aid, not a trusted approval boundary. Fork PRs may
wait for GitHub's normal contributor approval before checks run.

Release Drafter runs only on pushes to `main`. It reads merged PR titles
directly: `feat` selects Features and a minor increment, `fix` selects Fixes,
`docs` selects Documentation, and the other accepted types select Maintenance
with a patch increment. Breaking titles such as `feat(api)!: change response`
select Breaking Changes and a major increment. The highest matching increment
wins. Automatic PR labeling is not used. Existing category labels remain as a
fallback for historical PRs and Dependabot; `major` and `skip-changelog` retain
their manual override/exclusion behavior. Unmatched changes go under Other
Changes with a patch increment. Draft suggestions do not publish releases or
change the version files; review the draft before publication.
