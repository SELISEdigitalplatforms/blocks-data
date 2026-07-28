# Contributing to blocks-datagateway-next-sub

Thank you for your interest in contributing to **blocks-datagateway-next-sub**! Your contributions help improve this project for everyone. Whether you're reporting a bug, suggesting an enhancement, or submitting code changes, we welcome your input.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [How to Contribute](#how-to-contribute)
  - [Reporting Issues](#reporting-issues)
  - [Submitting Pull Requests](#submitting-pull-requests)
- [Branching Strategy](#branching-strategy)
- [Git Guidelines](#git-guidelines)
- [Coding Guidelines](#coding-guidelines)
- [Code Review Process](#code-review-process)
- [License](#license)

## Code of Conduct

Please read and follow our [Code of Conduct](./CODE_OF_CONDUCT.md). By participating in this project, you agree to abide by its terms.

## How to Contribute

### Reporting Issues

If you encounter a bug or any issue, please report it by [opening an issue](https://github.com/SELISEdigitalplatforms/blocks-datagateway-next-sub/issues/new) and include the following details:

- **Description**: A clear and concise description of the bug.
- **Steps to Reproduce**: Steps to replicate the issue.
- **Expected Behavior**: What should happen.
- **Actual Behavior**: What actually happens.
- **Screenshots**: If applicable, attach screenshots.
- **Environment**: Specify OS, browser, and versions.
- **Type**: Select type `Bug`
- **Project**: Select Project `Blocks Construct`

### Submitting Pull Requests

1. **Fork the Repository**: Click the "Fork" button at the top right of the repository page.
2. **Clone Your Fork**: Clone your forked repository to your local machine.
   ```bash
   git clone https://github.com/your-username/blocks-datagateway-next-sub.git
   cd blocks-datagateway-next-sub
   ```
3. **Create a Branch**: Create a new branch for your feature or bugfix.
   ```bash
   git checkout -b feature/your-feature-name
   ```
4. **Make Changes**: Implement your changes in the codebase.
5. **Commit Changes**: Follow the [Git Guidelines](#git-guidelines) for commit messages.
6. **Push to GitHub**: Push your changes to your forked repository.
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**: Navigate to the original repository and click "New Pull Request".

## Branching Strategy

We follow **Git Flow** for branching:

- `main`: Production-ready code.
- `dev`: Active development branch.
- `feature/*`: New features branching from `dev`.
- `bugfix/*`: Bug fixes branching from `dev`.
- `hotfix/*`: Emergency fixes branching from `main`.

## Git Guidelines

- **Use the Imperative Mood**: Start commit messages with a verb in the imperative mood (e.g., "add", "fix", "update", "remove").
- **Keep Messages Short and Descriptive**: The subject line should be concise (50 characters or less) and clearly describe the change.
- **Separate Subject from Body**: If more detail is needed, separate the subject from the body with a blank line. The body should explain the "what" and "why" of the changes.
- **Lowercase Commit Message**: Keep the commit message in lowercase.
- **Avoid Ending with a Period**: Do not end the subject line with a period.
- **Reference Issues and Pull Requests**: Reference related issues or pull requests in the body of the commit message (e.g., "fixes #123" or "see pr #456").
- **Use Conventional Commits**: Follow the Conventional Commits specification for a standardized commit message format. Types include `feat`, `fix`, `docs`, `style`, `refactor` and `test`.

Example of a well-structured commit message:

```
feat(data-gateway): add per-field validation rule support - issue(#318)

- add getSchemaFieldValidation, createSchemaFieldValidation, updateSchemaFieldValidation
  and deleteSchemaFieldValidation methods to ConfigurationService
- add corresponding TanStack Query hooks in use-configuration.ts
- add schema-field-validation-drawer component
- invalidate schema-details and unadapted-change-logs on mutation success
```

## Coding Guidelines

1. **Layer your code**: Add a service method first, then a hook, then a component. Never call the `http` client directly from a component.
2. **Single service singleton**: All hooks must go through `configurationService` from `services/configuration.service.ts`. Never instantiate `ConfigurationService` directly in hooks or components.
3. **Model your data**: Add TypeScript interfaces to the relevant `models/` file before implementing any service method or component. Use the `I` prefix for payload/response interfaces; no prefix for entity types and local UI types.
4. **Name consistently**: Files use `kebab-case`. Hooks are prefixed with `use-`. Service classes are suffixed with `Service`.
5. **Invalidate `unadapted-change-logs`**: Every mutation that changes schema structure, access rules, policies, or field validation must call `queryClient.invalidateQueries({ queryKey: ["unadapted-change-logs"] })` on success. This is the deployment signal that notifies the user to reload schemas.
6. **Write tests alongside code**: Every new service method and hook must have a corresponding `.test.ts` file in the same directory. Use Vitest + React Testing Library + MSW.
7. **Use the shared `http` client**: Import from `@/lib/http-client`. Do not introduce alternative HTTP libraries or call `fetch` directly.
8. **Environment variables**: Never hard-code URLs or API base paths. `API_BASES.UDS` and `API_BASES.CLOUD_BUILD` are derived from `NEXT_PUBLIC_API_BASE_URL` via the shared `constant/endpoint.constant.ts`.
9. **Pure utils**: Functions in `utils/` must be pure (no side effects, no React hooks). Add corresponding `.test.ts` files for all utility functions.

## Code Review Process

All PRs undergo review to maintain quality. Review steps:

1. **PR Submission**: Ensure PRs are small and well-documented.
2. **Automated Checks**: CI/CD will run tests and linting.
3. **Peer Review**: At least one maintainer must approve the PR.
4. **Merge Process**: Once approved, the PR is merged into `dev`.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](./LICENSE).
