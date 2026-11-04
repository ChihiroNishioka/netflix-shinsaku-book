import { describe, expect, it } from "vitest";
import { makePages, spreads, currentGroup, step } from "../../src/lib/book.js";
const items = Array.from({ length: 4 }, (_, i) => ({
  titleId: String(10000 + i),
  title: `作品${i + 1}`,
}));
describe("GREEN 9–10: 論理ページと移動", () => {
  it("3作品の1ページ表示に見返しを入れない", () =>
    expect(makePages(items.slice(0, 3), "single").map((p) => p.kind)).toEqual([
      "cover",
      "toc",
      "title",
      "title",
      "title",
      "back-cover",
    ]));
  it("3作品の見開きの組", () =>
    expect(spreads(makePages(items.slice(0, 3), "spread"))).toEqual([
      [0],
      [1, 2],
      [3, 4],
      [5],
    ]));
  it("4作品の内側を見返しで偶数にする", () => {
    const pages = makePages(items, "spread");
    expect(pages[6].kind).toBe("endpaper");
    expect(spreads(pages)).toEqual([[0], [1, 2], [3, 4], [5, 6], [7]]);
  });
  it("1ページの前後と端", () => {
    const p = makePages(items, "single");
    expect(step(p, 0, "single", "prev")).toBe(0);
    expect(step(p, p.length - 1, "single", "next")).toBe(p.length - 1);
    expect(step(p, 2, "single", "next")).toBe(3);
    expect(step(p, 2, "single", "prev")).toBe(1);
  });
  it("見開き通常移動は右側をfocusにする", () => {
    const p = makePages(items.slice(0, 3), "spread");
    expect(step(p, 0, "spread", "next")).toBe(2);
    expect(step(p, 2, "spread", "next")).toBe(4);
    expect(step(p, 4, "spread", "prev")).toBe(2);
    expect(step(p, 0, "spread", "prev")).toBe(0);
    expect(step(p, 5, "spread", "next")).toBe(5);
  });
  it("focusを変えずに見開きと1ページを往復できる", () => {
    const p = makePages(items, "spread");
    expect(currentGroup(p, 2, "spread")).toEqual([1, 2]);
    expect(currentGroup(p, 2, "single")).toEqual([2]);
    expect(currentGroup(p, 3, "spread")).toEqual([3, 4]);
    expect(currentGroup(p, 3, "single")).toEqual([3]);
  });
});
