import { describe, expect, it } from "vitest";
import { chooseLayout } from "../../src/lib/layout.js";
describe("GREEN 8: 画面の条件", () => {
  it.each([
    [390, 844, "single"],
    [884, 1104, "spread"],
    [1100, 800, "spread"],
    [699, 800, "single"],
    [700, 800, "spread"],
    [700, 1000, "single"],
    [750, 1000, "spread"],
    [749, 1000, "single"],
  ])("%sx%s は %s", (w, h, result) => expect(chooseLayout(w, h)).toBe(result));
});
