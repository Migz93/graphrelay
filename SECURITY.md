# Security Policy

## Reporting A Vulnerability

Use GitHub’s private vulnerability reporting for GraphRelay if it is enabled. Otherwise, contact the maintainer privately. Include the affected version, reproduction steps and impact. Keep Microsoft credentials, session cookies, subscription URLs and account data out of the report unless the maintainer provides a secure way to share them.

## Disclosure Expectations

Allow time for investigation and a fix before public disclosure.

## Scope

Security reports include authentication and authorization, Microsoft token handling, feed access, data exposure, Docker configuration, dependencies and workflows.

## Supported Versions

GraphRelay is early in development. A long-term security support policy has yet to be defined.

## Security Scanning

[CodeQL](.github/workflows/codeql.yml) scans JavaScript, TypeScript and GitHub Actions on pushes and PRs to `develop` and `main`, and weekly. Review findings in GitHub’s Security tab. Record the evidence and reason for any dismissal.

## Deployment Boundaries

Treat the full config volume as private. It contains the encryption key alongside the database. The database also stores cached list and calendar data. A subscription URL grants read access to its feed without an admin sign-in. Revoke an exposed URL in **Calendar → Feeds** and share a replacement only with intended subscribers. [Deployment](docs/deployment.md)
