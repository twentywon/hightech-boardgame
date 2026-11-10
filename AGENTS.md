# Development instructions

- Use the existing checkout. Cloud tasks are isolated; do not create a worktree unless explicitly requested.
- Use Node.js 24 LTS and npm. Install with `npm ci` (in this cloud, `--cache /tmp/wtg-npm` if needed).
- Start with `npm run dev`. Production check: `npm run build`. Rules: `npm test`. Browser: `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` in this cloud, or install Playwright Chromium locally.
- Keep rules and AI independent of Three.js and DOM. All moves must pass through `play`.
- Keep storage versioned and validate by replaying legal moves. Never trust saved board arrays.
- Preserve pointer confirmation on touch, camera-transition input blocking, and engine resource disposal.
- Keep unimplemented games visibly disabled. No automatic public deployment or repository visibility changes.
- Update README and ROADMAP for material changes. Test rule changes with Vitest and input/UI changes with Playwright.
