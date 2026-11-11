# Development instructions

- Use the existing checkout. Cloud tasks are isolated; do not create a worktree unless explicitly requested.
- Use Node.js 24 LTS and npm. Install with `npm ci` (in this cloud, `--cache /tmp/wtg-npm` if needed).
- Start with `npm run dev`. Production check: `npm run build`. Rules: `npm test`. Browser: `CHROMIUM_PATH=/usr/bin/chromium npm run test:e2e` in this cloud, or install Playwright Chromium locally.
- Keep rules and AI independent of Three.js and DOM. All moves must pass through `play`.
- Keep storage versioned and validate by replaying legal moves. Never trust saved board arrays.
- Preserve pointer confirmation on touch, camera-transition input blocking, and engine resource disposal.
- Keep unimplemented games visibly disabled. No automatic public deployment or repository visibility changes.
- Update README and ROADMAP for material changes. Test rule changes with Vitest and input/UI changes with Playwright.
- Reversi rules live in `src/games/reversi/rules.ts`: use shared legal-move generation for sessions and search, reconstruct automatic passes during replay, and keep Reversi storage keys separate from Gomoku.
- Browser Reversi AI must drain `searchSteps` cooperatively in its Worker. Mark exact endgames solved only after the full remaining placement depth completes; passes do not consume placement depth.
- Preserve nonblocking GPU startup readiness and scene/audio cleanup. Reversi AI evaluation: `npm run reversi:evaluate` (40 paired-color games at the documented budget scale plus timing samples).
- Chess uses pinned chess.js 1.4.0 through `src/games/chess/rules.ts`. Do not use its automatic threefold/50-move `isGameOver` policy; sessions implement claims separately from fivefold/75-move automatic draws.
- Chess sessions and preferences live only in memory: no persistence, resume feature, AI-vs-AI league, or Elo estimate. `npm run chess:measure` measures individual positions only.
- Keep chess repetition context and halfmove clocks in transposition keys, checked quiescence nodes searching evasions, and the chess.js BSD notice in exported artifacts.
- Gomoku undo rebuilds the state through `undo` in `rules.ts` (legal replay); cancel the opponent and hint Workers before replacing the state. Results against the computer are counted once, in `accept`, never on resume.
- `scripts/export-html.mjs` starts the embedded Workers as classic Workers so the single HTML works from `file://`; it must fail loudly if a Worker bundle keeps module syntax.
- Camera distance comes only from `cameraDistance` in `src/engine/camera.ts`; views and e2e click helpers must both use it. Stones, discs and marker rings share per-view geometry/materials (`BoardView.assets`): never dispose them when removing a mesh, only in `dispose`.
