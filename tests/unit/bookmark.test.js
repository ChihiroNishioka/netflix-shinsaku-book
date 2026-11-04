import { describe, expect, it } from "vitest";
import { makePages } from "../../src/lib/book.js";
import { restoreBookmark, saveBookmark } from "../../src/lib/bookmark.js";
const key = "nsb:bookmark:v1";
const data = {
  period: { start: "2026-11-01" },
  items: [
    { titleId: "10001", title: "一" },
    { titleId: "10002", title: "二" },
  ],
};
const pages = makePages(data.items, "single");
function storage(value) {
  const map = new Map(
    value === undefined
      ? []
      : [[key, typeof value === "string" ? value : JSON.stringify(value)]],
  );
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}
describe("GREEN 36–39: しおり", () => {
  it("focusの作品IDと期間を保存する", () => {
    const s = storage();
    saveBookmark(s, data, pages, 3);
    expect(JSON.parse(s.getItem(key))).toMatchObject({
      period: "2026-11",
      titleId: "10002",
      index: 3,
    });
  });
  it("非作品はIDを持たない", () => {
    const s = storage();
    saveBookmark(s, data, pages, 1);
    expect(JSON.parse(s.getItem(key))).toMatchObject({
      titleId: null,
      index: 1,
    });
  });
  it("有効IDを古いindexより優先する", () =>
    expect(
      restoreBookmark(
        storage({ period: "2026-11", titleId: "10002", index: 999 }),
        data,
        pages,
      ),
    ).toBe(3));
  it("非作品の有効indexを復元する", () =>
    expect(
      restoreBookmark(
        storage({ period: "2026-11", titleId: null, index: 1 }),
        data,
        pages,
      ),
    ).toBe(1));
  it("異なる月のしおりは削除する", () => {
    const s = storage({ period: "2026-10", titleId: "10002", index: 3 });
    expect(restoreBookmark(s, data, pages)).toBe(0);
    expect(s.getItem(key)).toBeNull();
  });
  it.each([
    "{壊れたJSON",
    JSON.stringify({ period: "2026-11", titleId: null, index: 999 }),
    JSON.stringify({ period: "2026-11", titleId: "99999", index: 3 }),
    JSON.stringify({ period: "2026-11", titleId: null, index: "2" }),
    "null",
  ])("不正・消失は表紙: %s", (value) =>
    expect(restoreBookmark(storage(value), data, pages)).toBe(0),
  );
  it("storage例外は表紙", () => {
    const s = {
      getItem() {
        throw Error("unavailable");
      },
      setItem() {
        throw Error("unavailable");
      },
    };
    expect(restoreBookmark(s, data, pages)).toBe(0);
    expect(() => saveBookmark(s, data, pages, 2)).not.toThrow();
  });
  it("0件は保存された位置より優先", () =>
    expect(
      restoreBookmark(
        storage({ period: "2026-11", titleId: null, index: 1 }),
        { ...data, items: [] },
        makePages([], "single"),
      ),
    ).toBe(0));
});
