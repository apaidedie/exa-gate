# Polish README preview path

## Goal

Improve the GitHub-facing first impression for Exa Reverse Proxy by making the README top section, demo path, and admin-console preview feel clearer, more credible, and easier to try within one minute.

This is a lightweight project-growth slice under the larger UI/UX polish goal. It should focus on presentation, copy hierarchy, and preview reproducibility rather than introducing new runtime behavior.

## Confirmed Facts

- `README.md` already includes CI/security/Docker badges, a Chinese product summary, a 60-second demo path, and a rendered admin console screenshot at `docs/assets/admin-console.png`.
- `npm run demo:ui` starts a local demo that requires no real Exa key and uses `admin_local_token`.
- `npm run capture:preview` renders `docs/assets/admin-console.png` from the same local demo through Playwright.
- The frontend stack is static HTML/CSS/ES modules with no framework or component library; this task should preserve that stack.
- Existing tests in `test/demo.test.ts` pin the README preview reference and capture script path.

## Requirements

- Keep the README concise and scan-friendly for a GitHub visitor deciding whether to star, try, or deploy the project.
- Strengthen the top-of-file positioning: what the project is, who it is for, and why it is different should be visible before the first screenshot.
- Make the 60-second demo path feel low-risk and concrete: no production Exa key, no external API calls, and the admin token should remain explicit.
- Improve the admin-console preview section so the screenshot is framed by useful context rather than presented as a generic image.
- Regenerate the README screenshot if it is stale relative to the current Admin Console UI.
- Keep documentation and scripts aligned with existing tests and docs references.
- Do not add new UI frameworks, external hosted assets, or marketing pages.

## Acceptance Criteria

- [x] `README.md` top section has clearer hierarchy, tighter copy, and a direct trial path.
- [x] `README.md` still references `docs/assets/admin-console.png` and `npm run capture:preview`.
- [x] The generated preview image exists, is non-empty, and reflects the current admin console.
- [x] Relevant README/demo tests pass.
- [x] Project lint, tests, build, and verify pass unless a failure is documented with a concrete external cause.
- [x] The task is archived and changes are committed after validation.

## Notes

- UI brief: audience is self-hosting developers and small teams evaluating an operational SaaS-style infra tool; primary workflow is deciding quickly whether to run the demo or deploy; source of truth is existing README, demo UI, and repository tests; acceptance depends on rendered screenshot regeneration plus tests.
