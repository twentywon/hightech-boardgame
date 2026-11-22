import { afterEach, describe, expect, it, vi } from "vitest";

// The full edition keeps every game; the student edition (VITE_EDITION=student) leaves out the gambling-like ones.
describe("catalog editions", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });
  it("the full edition shows every game", async () => {
    const { games, allGames, EDITION } = await import("../src/core/catalog");
    expect(EDITION).toBe("full");
    expect(games).toBe(allGames);
    expect(games.map((g) => g.name)).toEqual(expect.arrayContaining(["섯다", "고스톱", "블랙잭", "오목"]));
  });
  it("the student edition leaves out exactly the excluded games", async () => {
    vi.stubEnv("VITE_EDITION", "student");
    vi.resetModules();
    const { games, allGames, EDITION, STUDENT_EXCLUDED } = await import("../src/core/catalog");
    expect(EDITION).toBe("student");
    // Every name on the list is a real game, so none is silently kept by a misspelling.
    for (const en of STUDENT_EXCLUDED) expect(allGames.some((g) => g.en === en)).toBe(true);
    expect(games.length).toBe(allGames.length - STUDENT_EXCLUDED.length);
    const names = games.map((g) => g.name);
    for (const name of ["블랙잭", "섯다", "세븐 포커", "텍사스 홀덤", "인디언 포커", "고스톱", "코인 푸셔", "인형뽑기"]) expect(names).not.toContain(name);
    expect(names).toEqual(expect.arrayContaining(["오목", "바둑", "체스", "장기", "윷놀이", "원카드", "스파이더"]));
  });
});
