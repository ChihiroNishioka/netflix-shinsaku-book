import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { parseReleases, parseTitlePage } from "../../scripts/lib/parse.js";
const fixture = (name) =>
  readFileSync(
    new URL(`../fixtures/sources/${name}.html`, import.meta.url),
    "utf8",
  );
it("GREEN 3: 実HTMLからJPのみ、JST日付を抽出", () => {
  const p = parseReleases(fixture("releases"));
  expect(p.items).toHaveLength(2);
  expect(p.items[1]).toMatchObject({
    videoID: "81218437",
    title: "Bass X Machina: バス X マキナ",
    releaseDate: "2026-11-03",
  });
  expect(p.totalPages).toBe(4);
});
it("GREEN 4: JSON-LD の正規IDと公開情報を抽出", () => {
  expect(parseTitlePage(fixture("title"))).toMatchObject({
    titleId: "81088875",
    genres: ["アクション"],
    synopsisLang: "ja",
  });
});
it("GREEN 4: OG を代用する", () => {
  expect(
    parseTitlePage(
      '<meta property="og:description" content="A story &amp; more"><meta content="https://example.com/a.jpg" property="og:image">',
    ),
  ).toMatchObject({
    synopsis: "A story & more",
    synopsisLang: "en",
    imageUrl: "https://example.com/a.jpg",
  });
});
it("構造変更とJP以外の一覧を失敗として区別", () => {
  expect(() => parseReleases("<html></html>")).toThrow();
  expect(() =>
    parseReleases(
      '<script id="__NEXT_DATA__">{"props":{"pageProps":{"data":{"data":[{"country":"US"}],"totalPages":1,"current":1}}}}</script>',
    ),
  ).toThrow();
});
it("OGの引用符とHTMLエンティティを保つ", () => {
  expect(
    parseTitlePage(
      `<meta property="og:description" content="A hero's story &amp; life">`,
    ).synopsis,
  ).toBe("A hero's story & life");
});
