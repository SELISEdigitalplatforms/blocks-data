# Security Policy

## Reporting a Vulnerability

At **blocks-datagateway-next-sub**, we take security seriously. If you discover a security vulnerability, please follow the guidelines below to report it responsibly.

### How to Report

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, send an email to **blocks@selisegroup.com** with the following details:

- **Subject**: `[SECURITY] blocks-datagateway-next-sub - Brief Description`
- **Description**: A clear and concise description of the vulnerability.
- **Steps to Reproduce**: Detailed steps to reproduce the vulnerability.
- **Impact**: The potential impact of the vulnerability.
- **Suggested Fix**: If you have a suggested fix, please include it.

### What to Expect

- **Acknowledgment**: We will acknowledge receipt of your report within **48 hours**.
- **Assessment**: We will assess and validate the vulnerability within **7 business days**.
- **Resolution**: We will work on a fix and aim to resolve critical vulnerabilities within **30 days**.
- **Notification**: Once the vulnerability is resolved, we will notify you and credit you in the release notes (if desired).

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| Latest  | :white_check_mark: |
| Older   | :x:                |

## Security Best Practices

When integrating **blocks-datagateway-next-sub**, please adhere to the following best practices:

- Always use the latest version of the module.
- Ensure `NEXT_PUBLIC_API_BASE_URL` and related environment variables point only to trusted, TLS-secured endpoints.
- Do not expose API base URLs or gateway credentials in client-side bundles beyond what Next.js public variables require.
- Validate all field-level access control and policy configurations server-side; never rely solely on client-side permission checks.
- Rotate API keys and credentials regularly.
- Monitor access logs for unusual patterns in data source or schema operations.

## Disclosure Policy

We are committed to responsible disclosure. Once a vulnerability is confirmed and patched, we will publicly disclose the details in a security advisory to inform the community.

Thank you for helping keep **blocks-datagateway-next-sub** secure!
