# Security Policy

## Reporting a Vulnerability

Thank you for helping keep this project secure. Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately:

1. Go to **[Security → Advisories](https://github.com/apaidedie/exa-reverse-proxy/security/advisories/new)** on this repository.
2. Click **"Report a vulnerability"** and fill in the details.

Please include:

- A description of the issue and its potential impact.
- Steps to reproduce (proof of concept, logs, or minimal request examples).
- The version / image tag you tested (`al1ya/exa-reverse-proxy:<tag>` or commit SHA).
- Any suggested fix, if you have one.

You should receive an initial response within a few days. We will coordinate disclosure and credit with you once the issue is confirmed and a fix is available.

## Disclosure

- Confirmed vulnerabilities will be addressed as promptly as possible.
- A patched release and a GitHub Security Advisory will be published once users have had reasonable time to update.
- Please avoid public disclosure until a fix is released.

## Scope

This policy covers the source code and the published Docker images (`al1ya/exa-reverse-proxy`). Misconfiguration of your own deployment (weak tokens, exposing the admin port to the public internet, disabling `EXA_ADMIN_REQUIRE_HTTPS`) is out of scope — please review the **Security And Operations** section of the README.
