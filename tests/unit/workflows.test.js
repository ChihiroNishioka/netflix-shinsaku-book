import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const load = (name) =>
  parse(readFileSync(`.github/workflows/${name}.yml`, "utf8"));

describe("GREEN 43 公開とCIの契約", () => {
  it("公開はmain push・毎日・手動、contentsだけ、完成物を検査後gh-pagesへpush", () => {
    const workflow = load("publish");
    expect(workflow.on).toHaveProperty("workflow_dispatch");
    expect(workflow.on.schedule[0].cron).toBe("0 21 * * *");
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.permissions).toEqual({ contents: "write" });
    expect(workflow.concurrency).toBeTruthy();
    const steps = workflow.jobs.publish.steps;
    const commands = steps.map((step) => step.run || "").join("\n");
    expect(commands).toContain("npm run build:data");
    expect(commands).toContain("npm run check:pii");
    expect(commands).toContain("sha256sum -c");
    expect(commands.indexOf("test -f dist/.nojekyll")).toBeLessThan(
      commands.indexOf("HEAD:gh-pages"),
    );
    expect(commands.indexOf("validateData")).toBeLessThan(
      commands.indexOf("HEAD:gh-pages"),
    );
    expect(commands).toContain("HEAD:gh-pages");
  });
  it("CIでlint・単体・E2E・履歴秘密検査、ブラウザ失敗artifactを実行", () => {
    const workflow = load("ci");
    expect(workflow.on).toHaveProperty("pull_request");
    expect(workflow.on.push.branches).toEqual(["main"]);
    expect(workflow.permissions).toEqual({ contents: "read" });
    const text = JSON.stringify(workflow);
    for (const command of [
      "npm run lint",
      "npm test",
      "npm run build",
      "npm run test:e2e",
      "npm run check:pii",
      "gitleaks git --redact",
      "sha256sum -c",
    ])
      expect(text).toContain(command);
    expect(text).toContain("playwright-report");
    expect(text).toContain("test-results");
    expect(text).toContain("fetch-depth");
  });
  it("全actionはSHA固定で追加credentialや禁止actionがない", () => {
    for (const name of ["ci", "publish"]) {
      const workflow = load(name);
      const text = JSON.stringify(workflow);
      expect(text).not.toMatch(
        /gitleaks-action|configure-pages|peaceiris\/actions-gh-pages/,
      );
      const secrets = text.match(/secrets\.\w+/g) || [];
      expect(secrets.every((secret) => secret === "secrets.GITHUB_TOKEN")).toBe(
        true,
      );
      for (const job of Object.values(workflow.jobs))
        for (const step of job.steps)
          if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
    }
  });
});
