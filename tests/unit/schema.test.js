import { describe, expect, it } from "vitest";
import data from "../fixtures/data-3.json";
import empty from "../fixtures/data-empty.json";
import invalid from "../fixtures/data-invalid.json";
import { validateData } from "../../src/lib/schema.js";
describe("GREEN 1–2: データ境界", () => {
  it("正常・空を受理し不正なリンクを拒否する", () => {
    expect(validateData(data).ok).toBe(true);
    expect(validateData(empty).ok).toBe(true);
    expect(validateData(invalid).errors.join()).toContain("netflixUrl");
  });
  const mutations = {
    duplicate: (d) => d.items.push(d.items[0]),
    id: (d) => (d.items[0].titleId = "abc"),
    url: (d) => (d.items[0].netflixUrl += "?x"),
    range: (d) => (d.items[0].releaseDate = "2026-12-01"),
    http: (d) => (d.items[0].imageUrl = "http://example.com/a"),
    sources: (d) => (d.sources = []),
    unknown: (d) => (d.extra = true),
    date: (d) => (d.period.end = "2026-11-31"),
    timezone: (d) => delete d.period.timezone,
    language: (d) => (d.items[0].synopsisLang = null),
    status: (d) => (d.status = "empty"),
    nested: (d) => (d.items[0].extra = true),
    timestamp: (d) => (d.generatedAt = "2026-11-05"),
    period: (d) => (d.period.start = "2026-12-01"),
  };
  for (const [name, mutate] of Object.entries(mutations))
    it(`拒否: ${name}`, () => {
      const d = structuredClone(data);
      mutate(d);
      expect(validateData(d).ok).toBe(false);
    });
});
