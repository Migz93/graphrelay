<!-- shared: structure — adapted from the Migz93 self-hosted app guides -->

# Security Policy

## Reporting A Vulnerability

Use GitHub’s private vulnerability reporting for GraphRelay if available. Otherwise contact the maintainer privately. Include the affected revision, reproduction steps, impact and any suggested mitigation. Keep credentials, session cookies, feed URLs and private data out of shared evidence.

## Disclosure Expectations

Allow time for investigation and a fix before public disclosure.

## Scope

Relevant reports include authentication, authorization, Microsoft credential handling, feed access, data exposure, dependencies, workflows and deployment configuration.

## Supported Versions

GraphRelay is in early development. Security fixes are handled on the current development line.

## Security Scanning

| What is scanned | Scanner | Where it runs |
|---|---|---|
| Source and GitHub Actions | CodeQL | Pushes and PRs to `main` and `develop`, plus a weekly schedule when code scanning is available |
| Published AMD64 and ARM64 images | Trivy | Develop and release publish workflows |
| npm, GitHub Actions and Docker updates | Dependabot | Daily update configuration in [dependabot.yml](.github/dependabot.yml) |

GitHub’s code-scanning upload requires a supported repository. On a private repo, set the `GRAPHRELAY_CODE_SCANNING` Actions variable to `true` only when GitHub Code Security is enabled. Trivy reports remain available as workflow artifacts when SARIF upload is unavailable. [GitHub code scanning availability](https://docs.github.com/en/code-security/concepts/code-scanning/code-scanning)

## Fixing And Dismissing Alerts

Verify findings against the actual code and deployment. Fix vulnerabilities with a realistic impact. When dismissing an alert, record the reason and evidence so a future reviewer can reproduce the decision. [Workflow](docs/workflow.md)

## Deployment Boundaries

Treat the entire config volume as private. It holds the database and encryption key, including cached list and calendar data. Subscription URLs grant feed access without a GraphRelay session. Revoke an exposed URL from the feed’s Settings and share the replacement with intended subscribers. [Deployment](docs/deployment.md)
