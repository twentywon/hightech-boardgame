# Development rules

- Work in the existing checkout. Cloud tasks are isolated; create a worktree only when explicitly requested.
- Godot 4.6.3 standard, GDScript, Compatibility rendering. Do not introduce C#/.NET or native platform dependencies.
- Read README.md before running. In this Cloud environment activate `export PATH=/workspace/godot-cloud/bin:$PATH`.
- Keep game rules in `games/<game>/rules` as pure RefCounted models. No rendering, scene nodes, timers, input, UI, or filesystem access in rules.
- Presentation owns meshes, input projection, animation and UI. Rule validation is authoritative; reject occupied/out-of-range/post-game moves in the model.
- Gomoku is freestyle: black starts, 15×15, at least five contiguous wins, no forbidden moves, full board without a winner is a draw. Do not silently switch to Renju or exact-five rules.
- Add regression coverage when changing rules or interaction lifecycle. Use deterministic fixtures and explicit nonzero failure exits; assertion logs alone are insufficient.
- Required validation: `python3 tools/check_project.py .` then `godot --headless --path . --script res://tests/run_tests.gd`. For visual changes also test rendered output when a browser/display is available. Report skipped/unsupported checks honestly.
- Keep .gd.uid files and export_presets.cfg tracked. Never commit .godot/, exports/, private signing credentials or export_credentials.cfg.
- Preserve other games' boundaries. Add shared abstractions only when an actual second game needs them.
- Support different viewport aspect ratios and mouse/touch input. Do not claim Android/iOS/Windows readiness from Linux headless tests alone.
