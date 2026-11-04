import { expect, it } from "vitest";
import data from "../fixtures/data-3.json";
import { buildData, monthPeriod } from "../../scripts/lib/build.js";
import { validateData } from "../../src/lib/schema.js";
const now = new Date("2026-11-05T06:00:00+09:00");
const row = (videoID, title, releaseDate) => ({
  videoID,
  title,
  subtitle: null,
  releaseDate,
  imageUrl: null,
});
const fail = async () => {
  throw new Error("取得失敗");
};
const base = {
  now,
  loadA: async () => ({
    items: [
      row("81218437", "同じ作品", "2026-11-04"),
      row("81218438", "同じ作品", "2026-11-03"),
    ],
    partial: false,
  }),
  loadB: async () => ({
    titleId: "81088875",
    synopsis: null,
    synopsisLang: null,
    imageUrl: null,
    genres: [],
  }),
  loadC: fail,
};
it("GREEN 5: 正規IDで重複をまとめ最初の配信日を選ぶ", async () => {
  const d = await buildData(base);
  expect(d.items).toHaveLength(1);
  expect(d.items[0]).toMatchObject({
    titleId: "81088875",
    releaseDate: "2026-11-03",
  });
  expect(validateData(d).ok).toBe(true);
});
it("GREEN 6: A失敗時C・前回・空の順", async () => {
  const c = await buildData({
    ...base,
    loadA: fail,
    loadC: async () => ({ items: [row("81088875", "公開作品", "2026-11-03")] }),
  });
  expect(c.status).toBe("partial");
  expect(c.sources[0].name).toContain("日本配信未確認");
  const stale = await buildData({ ...base, loadA: fail, previous: data });
  expect(stale.status).toBe("stale");
  expect(stale.generatedAt).toBe(data.generatedAt);
  const empty = await buildData({ ...base, loadA: fail });
  expect(empty.status).toBe("empty");
  expect(empty.note).toBeTruthy();
  for (const d of [c, stale, empty]) expect(validateData(d).ok).toBe(true);
});
it("GREEN 7: 日付と日本語タイトル順", async () => {
  const d = await buildData({
    ...base,
    loadA: async () => ({
      items: [
        row("81000001", "わ", "2026-11-03"),
        row("81000002", "あ", "2026-11-03"),
        row("81000003", "ん", "2026-11-02"),
      ],
    }),
    loadB: fail,
  });
  expect(d.items.map((x) => x.title)).toEqual(["ん", "あ", "わ"]);
  expect(d.status).toBe("partial");
});
it("正常な0件はCへ移らずempty、破損前回は不採用", async () => {
  const d = await buildData({
    ...base,
    loadA: async () => ({ items: [] }),
    loadC: () => {
      throw Error("呼んではいけない");
    },
  });
  expect(d.status).toBe("empty");
  const e = await buildData({
    ...base,
    loadA: fail,
    previous: { broken: true },
  });
  expect(e.status).toBe("empty");
});
it("月の境界は実行時の日本時間", () => {
  expect(monthPeriod(new Date("2026-11-30T16:00:00Z")).start).toBe(
    "2026-12-01",
  );
  expect(monthPeriod(now).end).toBe("2026-11-30");
});
it("検証不合格の候補も有効な前回または空へ戻す", async () => {
  const bad = {
    ...base,
    loadA: async () => ({ items: [row("bad", "不正", "2026-11-03")] }),
    loadB: fail,
  };
  const d = await buildData({ ...bad, previous: data });
  expect(d.status).toBe("stale");
  const e = await buildData(bad);
  expect(e.status).toBe("empty");
  expect(validateData(e).ok).toBe(true);
});
