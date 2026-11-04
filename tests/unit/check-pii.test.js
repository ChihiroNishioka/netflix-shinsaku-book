import { describe, expect, it } from "vitest";
import { scanText, scanProject } from "../../scripts/check-pii.mjs";

describe("GREEN 41 秘密と個人情報を値を出さずに検出する", () => {
  const cases = [
    ["メール", ["private", "@", "real-domain", ".net"].join("")],
    ["電話", ["090", "1234", "5678"].join("-")],
    ["国際電話", ["+81", "3", "1234", "5678"].join(" ")],
    ["携帯", ["080", "1234", "5678"].join("")],
    [
      "郵便住所",
      ["〒", "100", "-", "0001", " 東京都千代田区", "1", "-", "1"].join(""),
    ],
    ["番地住所", ["東京都", "千代田区", "1", "-", "1"].join("")],
    ["秘密", ["gh", "p_", "a".repeat(40)].join("")],
    ["秘密", ["github", "_pat_", "a".repeat(55)].join("")],
    ["秘密", ["s", "k-", "a".repeat(24)].join("")],
    ["秘密", ["AK", "IA", "A".repeat(16)].join("")],
    ["秘密", ["xo", "xb-", "123456789012", "-", "abcabcabcabc"].join("")],
    ["秘密", ["-----BEGIN ", "RSA ", "PRIVATE KEY-----"].join("")],
  ];
  for (const [index, [kind, value]] of cases.entries()) {
    it(`${kind} の組み立てた検出例 ${index + 1}`, () => {
      const findings = scanText(value);
      expect(findings.length).toBeGreaterThan(0);
      expect(JSON.stringify(findings)).not.toContain(value);
    });
  }
  it("許可メールとNetflix ID、URL、認証に無関係な一般語は許可する", () => {
    for (const value of [
      ["41898282+github-actions[bot]", "@users.noreply.github.com"].join(""),
      ["noreply", "@anthropic.com"].join(""),
      ["author", "@example.com"].join(""),
      "81088875",
      "https://www.netflix.com/title/81088875",
      "token Authorization",
    ])
      expect(scanText(value)).toEqual([]);
  });
});

it("GREEN 42 管理ファイル・fixtures・生成済みdistに秘密と個人情報がない", async () => {
  expect(await scanProject()).toEqual([]);
});
