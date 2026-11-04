import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const rules = [
  ["email", /[A-Za-z0-9._%+\-[\]]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g],
  [
    "phone",
    /(?<![\d])(?:0\d{1,4}-\d{1,4}-\d{3,4}|0[789]0\d{8}|\+81[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{3,4})(?!\d)/g,
  ],
  [
    "address",
    /〒\s?\d{3}-\d{4}|\d{3}-\d{4}\s*(?:東京都|北海道|大阪府|京都府|[^\s\d]{2,3}県)|(?:東京都|北海道|大阪府|京都府|[^\s\d]{2,3}県)[^\n]{0,40}[市区町村][^\n]{0,30}\d+-\d+(?:-\d+)?/g,
  ],
  [
    "secret",
    /gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,}|sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/g,
  ],
];

function allowedEmail(value) {
  return (
    /@(?:users\.noreply\.github\.com|example\.com)$/i.test(value) ||
    value.toLowerCase() === ["noreply", "@anthropic.com"].join("")
  );
}

export function scanText(text, path = "<text>") {
  const findings = [];
  for (const [rule, pattern] of rules) {
    for (const match of text.matchAll(pattern)) {
      if (rule === "email" && allowedEmail(match[0])) continue;
      findings.push({
        path,
        rule,
        line: text.slice(0, match.index).split("\n").length,
      });
    }
  }
  return findings;
}

async function walk(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? walk(resolve(directory, entry.name))
          : entry.isFile()
            ? [resolve(directory, entry.name)]
            : [],
      ),
    );
    return files.flat();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

export async function scanProject(root = process.cwd()) {
  const tracked = execFileSync(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean);
  const files = new Set([
    ...tracked.map((file) => resolve(root, file)),
    ...(await walk(resolve(root, "dist"))),
  ]);
  const findings = [];
  for (const file of files) {
    let content;
    try {
      content = await readFile(file);
    } catch (error) {
      if (error.code === "ENOENT") continue;
      throw error;
    }
    if (content.includes(0)) continue;
    findings.push(...scanText(content.toString("utf8"), relative(root, file)));
  }
  return findings;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const findings = await scanProject();
  if (findings.length) {
    for (const finding of findings)
      console.error(
        `${finding.path}:${finding.line} ${finding.rule} [値は非表示]`,
      );
    process.exitCode = 1;
  } else console.log("秘密と個人情報: 0件");
}
