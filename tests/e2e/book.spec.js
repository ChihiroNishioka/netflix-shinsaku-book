import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = (name) =>
  JSON.parse(
    readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), "utf8"),
  );
const test = base.extend({
  network: [
    async ({ context }, use) => {
      const unexpected = [];
      const state = {
        data: fixture("data-3"),
        status: 200,
        raw: null,
        delay: 0,
        imageFailure: false,
        requests: [],
        allowNetflix: false,
      };
      await context.route("**/*", async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (["127.0.0.1", "localhost"].includes(url.hostname)) {
          if (url.pathname.endsWith("/data.json")) {
            state.requests.push(req.url());
            if (state.delay)
              await new Promise((resolve) => setTimeout(resolve, state.delay));
            await route
              .fulfill({
                status: state.status,
                contentType: "application/json",
                body: state.raw ?? JSON.stringify(state.data),
              })
              .catch(() => {});
          } else await route.continue();
        } else if (req.resourceType() === "image") {
          await route.fulfill({
            status: state.imageFailure ? 404 : 200,
            contentType: "image/svg+xml",
            body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#5c6e65"/><circle cx="400" cy="220" r="110" fill="#c8ab71"/></svg>',
          });
        } else if (
          state.allowNetflix &&
          url.hostname === "www.netflix.com" &&
          req.isNavigationRequest()
        ) {
          await route.fulfill({
            contentType: "text/html",
            body: '<!doctype html><html lang="ja"><title>リンク確認</title></html>',
          });
        } else {
          unexpected.push(req.url());
          await route.abort();
        }
      });
      await use(state);
      expect(
        unexpected,
        "明示リンク試行と画像差替え以外の外部リクエスト",
      ).toEqual([]);
    },
    { auto: true },
  ],
});
const book = (p) => p.getByTestId("book");
async function ready(p) {
  await p.goto("./");
  await expect(book(p)).toHaveAttribute("data-state", "ready");
}
async function settled(p) {
  await expect(book(p)).toHaveAttribute("data-flipping", "false");
}
async function go(p, key) {
  await p.keyboard.press(key);
  await settled(p);
}
async function firstTitle(p) {
  await go(p, "ArrowRight");
  if ((await book(p).getAttribute("data-layout")) === "single")
    await go(p, "ArrowRight");
}
async function shot(p, info, name) {
  await p.screenshot({
    path: `docs/screenshots/${info.project.name}-${name}.png`,
    fullPage: true,
  });
}
async function swipe(p, dx, dy = 0) {
  const box = await book(p).boundingBox();
  const x = box.x + box.width / 2,
    y = box.y + box.height * 0.8;
  await book(p).dispatchEvent("pointerdown", {
    pointerId: 1,
    pointerType: "touch",
    clientX: x,
    clientY: y,
    bubbles: true,
  });
  await book(p).dispatchEvent("pointermove", {
    pointerId: 1,
    pointerType: "touch",
    clientX: x + dx,
    clientY: y + dy,
    bubbles: true,
  });
  await book(p).dispatchEvent("pointerup", {
    pointerId: 1,
    pointerType: "touch",
    clientX: x + dx,
    clientY: y + dy,
    bubbles: true,
  });
  await settled(p);
}

test("GREEN 11–16,44: 表紙・目次・作品と日本語、横スクロールなし", async ({
  page,
  network,
}, info) => {
  await ready(page);
  const expectedLayout = info.project.name === "iphone" ? "single" : "spread";
  await expect(book(page)).toHaveAttribute("data-layout", expectedLayout);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Netflix新作集",
  );
  await expect(page.getByTestId("cover")).toContainText(
    network.data.period.label,
  );
  await expect(page.getByTestId("cover")).toContainText("全 3 作品");
  await expect(page.getByTestId("position")).toHaveText("表紙");
  const seal = page.getByTestId("reload-seal");
  await expect(seal).toHaveAttribute("aria-label", "最新の情報を読み直す");
  const sealBox = await seal.boundingBox();
  expect(sealBox.width).toBeGreaterThanOrEqual(44);
  expect(sealBox.height).toBeGreaterThanOrEqual(44);
  await shot(page, info, "cover");
  await go(page, "ArrowRight");
  await expect(page.getByTestId("reload-seal")).toBeHidden();
  await expect(page.getByTestId("toc")).toBeVisible();
  const rows = page.getByTestId("toc-item");
  await expect(rows).toHaveCount(3);
  for (let i = 0; i < 3; i++) {
    await expect(rows.nth(i)).toContainText(network.data.items[i].title);
    await expect(rows.nth(i)).toContainText(String(i + 2));
  }
  expect(await page.locator("[data-page-kind]").count()).toBe(
    expectedLayout === "single" ? 1 : 2,
  );
  if (expectedLayout === "spread") {
    const toc = await page.getByTestId("toc").boundingBox();
    const title = await page.getByTestId("title-name").first().boundingBox();
    expect(toc.x).toBeLessThan(title.x);
  }
  await shot(page, info, "toc");
  await rows.first().click();
  await settled(page);
  await expect(page.getByTestId("title-name").first()).toHaveText(
    network.data.items[0].title,
  );
  for (const id of ["title-image", "release-date", "genres", "synopsis"])
    await expect(page.getByTestId(id).first()).toBeVisible();
  await expect(page.getByTestId("release-date").first()).toContainText("11月");
  const img = await page.getByTestId("title-image").first().boundingBox();
  const name = await page.getByTestId("title-name").first().boundingBox();
  const paper = await page
    .locator('[data-page-kind="title"]')
    .first()
    .boundingBox();
  expect(img.y).toBeLessThan(name.y);
  expect(img.height / paper.height).toBeGreaterThanOrEqual(0.45);
  expect(img.height / paper.height).toBeLessThanOrEqual(0.55);
  await shot(page, info, "page");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("GREEN 12: resize往復でもfocusの作品を保つ", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await firstTitle(page);
  const title = await page.getByTestId("title-name").innerText();
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(book(page)).toHaveAttribute("data-layout", "spread");
  await expect(
    page.getByTestId("title-name").filter({ hasText: title }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(book(page)).toHaveAttribute("data-layout", "single");
  await expect(page.getByTestId("title-name")).toHaveText(title);
});

test("GREEN 17: 通常のaリンクを別ページへ開き元の本を保つ", async ({
  page,
  context,
  network,
}) => {
  network.allowNetflix = true;
  await ready(page);
  await firstTitle(page);
  const link = page.getByTestId("title-link").first();
  const url = network.data.items[0].netflixUrl;
  await expect(link).toHaveAttribute("href", url);
  await expect(link).toHaveAttribute("target", "_blank");
  await expect(link).toHaveAttribute("rel", /noopener/);
  await expect(link).toHaveAttribute("rel", /noreferrer/);
  const before = await book(page).getAttribute("data-current");
  const popupPromise = context.waitForEvent("page");
  await link.click();
  const popup = await popupPromise;
  await popup.waitForURL(url);
  await expect(book(page)).toHaveAttribute("data-current", before);
  await popup.close();
});

for (const broken of [false, true])
  test(`GREEN 18: 画像${broken ? "404" : "null"}と未公開あらすじ`, async ({
    page,
    network,
  }) => {
    network.data.items[0].synopsis = null;
    network.data.items[0].synopsisLang = null;
    if (broken) network.imageFailure = true;
    else network.data.items[0].imageUrl = null;
    await ready(page);
    await firstTitle(page);
    await expect(page.getByTestId("image-fallback").first()).toBeVisible();
    await expect(page.getByTestId("synopsis").first()).toHaveText(
      "あらすじは、まだ公開されていません。",
    );
    await expect(page.getByTestId("title-link").first()).toHaveAttribute(
      "href",
      network.data.items[0].netflixUrl,
    );
  });

test("補足: 英語の本文と未定ジャンル、partialの出典", async ({
  page,
  network,
}) => {
  network.data.items[0].synopsis = "A public synopsis.";
  network.data.items[0].synopsisLang = "en";
  network.data.items[0].genres = [];
  network.data.status = "partial";
  network.data.sources = [
    {
      name: "Wikidata（日本配信未確認）",
      url: "https://query.wikidata.org/sparql",
      fetchedAt: network.data.generatedAt,
    },
  ];
  await ready(page);
  await expect(page.getByTestId("cover")).toContainText("日本配信未確認");
  await firstTitle(page);
  await expect(page.getByTestId("synopsis").first()).toHaveAttribute(
    "lang",
    "en",
  );
  await expect(page.getByTestId("genres").first()).toHaveText("ジャンル未定");
  await go(page, "End");
  await expect(page.locator('[data-page-kind="back-cover"]')).toContainText(
    "Wikidata",
  );
});

test("GREEN 19: 3D両面と影を持つめくり途中を保存", async ({ page }, info) => {
  await ready(page);
  await page.getByTestId("next").click();
  await expect(book(page)).toHaveAttribute("data-flipping", "true");
  const leaf = page.locator(".leaf");
  await expect(leaf).toBeVisible();
  await page.evaluate(() => {
    for (const animation of document.getAnimations()) {
      if (animation.effect?.target?.closest?.(".leaf")) {
        animation.pause();
        animation.currentTime = 350;
      }
    }
  });
  const transform = await leaf.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).not.toBe("none");
  expect(
    await leaf
      .locator("*")
      .evaluateAll(
        (els) =>
          els.filter(
            (el) => getComputedStyle(el).backfaceVisibility === "hidden",
          ).length,
      ),
  ).toBeGreaterThanOrEqual(2);
  await shot(page, info, "flipping");
  await page.evaluate(() => document.getAnimations().forEach((a) => a.play()));
  await expect(book(page)).toHaveAttribute("data-flipping", "false", {
    timeout: 900,
  });
  await expect(book(page)).toHaveAttribute("data-current", "1");
  await shot(page, info, "flipped");
});

test("GREEN 20,22,25–27: キー操作・端・読み上げ・目次ジャンプ", async ({
  page,
  network,
}) => {
  await ready(page);
  await expect(page.getByTestId("prev")).toBeDisabled();
  await go(page, "ArrowLeft");
  await expect(book(page)).toHaveAttribute("data-current", "0");
  await go(page, "ArrowRight");
  await expect(page.getByTestId("announcer")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  await page.getByTestId("toc-item").nth(2).click();
  await settled(page);
  await expect(
    page
      .getByTestId("title-name")
      .filter({ hasText: network.data.items[2].title }),
  ).toBeVisible();
  await expect(page.getByTestId("announcer")).toContainText(
    network.data.items[2].title,
  );
  await expect(page.getByTestId("announcer")).toContainText("ページ");
  await page.getByTestId("toc-button").click();
  await settled(page);
  await expect(page.getByTestId("toc")).toBeVisible();
  await go(page, "End");
  await expect(page.locator('[data-page-kind="back-cover"]')).toBeVisible();
  await expect(page.getByTestId("next")).toBeDisabled();
  await go(page, "Home");
  await expect(page.getByTestId("cover")).toBeVisible();
});

test("GREEN 20: ページの左右タップ", async ({ page }) => {
  await ready(page);
  let b = await book(page).boundingBox();
  await page.mouse.click(b.x + b.width * 0.8, b.y + b.height * 0.75);
  await settled(page);
  await expect(book(page)).toHaveAttribute("data-current", "1");
  b = await book(page).boundingBox();
  await page.mouse.click(b.x + b.width * 0.1, b.y + b.height * 0.9);
  await settled(page);
  await expect(book(page)).toHaveAttribute("data-current", "0");
});

test("GREEN 21: スワイプ閾値・縦方向・cancel", async ({ page }, info) => {
  test.skip(info.project.name === "landscape", "タッチ端末で検証");
  await ready(page);
  await swipe(page, -30);
  await expect(book(page)).toHaveAttribute("data-current", "0");
  await swipe(page, -60, 100);
  await expect(book(page)).toHaveAttribute("data-current", "0");
  await swipe(page, -120);
  await expect(book(page)).toHaveAttribute("data-current", "1");
  await swipe(page, 120);
  await expect(book(page)).toHaveAttribute("data-current", "0");
  await book(page).dispatchEvent("pointerdown", {
    pointerId: 2,
    clientX: 200,
    clientY: 300,
  });
  await book(page).dispatchEvent("pointermove", {
    pointerId: 2,
    clientX: 80,
    clientY: 300,
  });
  await book(page).dispatchEvent("pointercancel", { pointerId: 2 });
  await settled(page);
  await expect(book(page)).toHaveAttribute("data-current", "0");
});

test("GREEN 23: 待機入力は1つだけ", async ({ page }) => {
  await ready(page);
  await page.getByTestId("next").click();
  await expect(book(page)).toHaveAttribute("data-flipping", "true");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  const target =
    (await book(page).getAttribute("data-layout")) === "single" ? "2" : "3";
  await expect(book(page)).toHaveAttribute("data-current", target, {
    timeout: 2000,
  });
  await settled(page);
});

test("GREEN 24: reduced-motionは200ms以内、3Dなし", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await ready(page);
  await expect(book(page)).toHaveAttribute("data-motion", "reduced");
  await page.getByTestId("next").click();
  const transforms = await page
    .locator(".leaf")
    .evaluateAll((els) => els.map((el) => getComputedStyle(el).transform));
  expect(
    transforms.every((t) => t === "none" || !t.startsWith("matrix3d")),
  ).toBe(true);
  await expect(book(page)).toHaveAttribute("data-flipping", "false", {
    timeout: 200,
  });
  await expect(book(page)).toHaveAttribute("data-current", "1");
});

test("GREEN 28: 大量の目次は内側だけスクロール", async ({ page, network }) => {
  network.data = fixture("data-12");
  network.data.items = Array.from({ length: 60 }, (_, i) => ({
    ...network.data.items[i % 12],
    titleId: String(70000 + i),
    netflixUrl: `https://www.netflix.com/title/${70000 + i}`,
    title: `目次項目 ${i + 1} — 長い作品名の折り返しを確かめる`,
  }));
  await ready(page);
  await go(page, "ArrowRight");
  const toc = page.getByTestId("toc");
  expect(
    await toc.evaluate((el) =>
      [el, ...el.querySelectorAll("*")].some(
        (e) =>
          e.scrollHeight > e.clientHeight &&
          ["auto", "scroll"].includes(getComputedStyle(e).overflowY),
      ),
    ),
  ).toBe(true);
  await page.getByTestId("toc-item").last().click();
  await settled(page);
  await expect(
    page
      .getByTestId("title-name")
      .filter({ hasText: network.data.items.at(-1).title }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("GREEN 29: 300ms後にloading、応答後は表紙", async ({
  page,
  network,
}, info) => {
  network.delay = 1500;
  await page.goto("./");
  await expect(page.getByTestId("state-loading")).toBeVisible();
  await expect(book(page)).toHaveAttribute("data-state", "loading");
  await expect(page.getByTestId("state-loading")).toHaveAttribute(
    "role",
    "status",
  );
  await expect(page.getByTestId("state-loading")).toContainText(
    "本を用意しています",
  );
  await shot(page, info, "loading");
  await expect(book(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("state-loading")).toBeHidden();
});

test("補足: 速い応答はloadingを表示しない", async ({ page }) => {
  await page.addInitScript(() => {
    window.loadingObserved = false;
    new MutationObserver(() => {
      const el = document.querySelector('[data-testid="state-loading"]');
      if (el && getComputedStyle(el).display !== "none" && !el.hidden)
        window.loadingObserved = true;
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
  await ready(page);
  expect(await page.evaluate(() => window.loadingObserved)).toBe(false);
});

for (const failure of ["http", "json", "schema", "network"])
  test(`GREEN 30–31: ${failure}エラーと再試行`, async ({
    page,
    network,
  }, info) => {
    if (failure === "http") network.status = 500;
    if (failure === "json") network.raw = "{broken";
    if (failure === "schema") network.data = fixture("data-invalid");
    if (failure === "network")
      await page.route("**/data.json", (route) => route.abort());
    await page.goto("./");
    await expect(book(page)).toHaveAttribute("data-state", "error");
    await expect(page.getByTestId("state-error")).toHaveAttribute(
      "role",
      "alert",
    );
    await expect(page.getByTestId("state-error")).toContainText(
      "本を開けませんでした",
    );
    await expect(page.getByTestId("retry")).toContainText("もう一度読む");
    await shot(page, info, `error-${failure}`);
    if (failure === "network") await page.unroute("**/data.json");
    network.status = 200;
    network.raw = null;
    network.data = fixture("data-3");
    await page.getByTestId("retry").click();
    await expect(book(page)).toHaveAttribute("data-state", "ready");
    expect(network.requests.at(-1)).toContain("t=");
  });

test("補足: 10秒timeout後の遅延応答は採用しない", async ({ page, network }) => {
  network.delay = 11500;
  await page.goto("./");
  await expect(book(page)).toHaveAttribute("data-state", "error", {
    timeout: 11000,
  });
  await expect(page.getByTestId("state-error")).toBeVisible();
  await page.waitForTimeout(1700);
  await expect(book(page)).toHaveAttribute("data-state", "error");
});

test("GREEN 32: 0件は全操作で表紙固定、封蝋を使える", async ({
  page,
  network,
}, info) => {
  network.data = fixture("data-empty");
  await page.goto("./");
  await expect(book(page)).toHaveAttribute("data-state", "empty");
  await expect(page.getByTestId("state-empty")).toContainText(
    "今月の新作は、まだ載っていません。",
  );
  await expect(page.getByTestId("cover")).toContainText(
    network.data.period.label,
  );
  await expect(page.getByTestId("next")).toBeDisabled();
  await expect(page.getByTestId("toc-button")).toBeHidden();
  for (const key of ["ArrowRight", "ArrowLeft", "Home", "End"])
    await page.keyboard.press(key);
  await swipe(page, -120);
  await expect(book(page)).toHaveAttribute("data-current", "0");
  await expect(page.getByTestId("reload-seal")).toBeEnabled();
  await shot(page, info, "empty");
});

test("GREEN 33–34: 封蝋の成功・失敗、読み直し競合・0件へ更新", async ({
  page,
  network,
}) => {
  await ready(page);
  network.data = fixture("data-12");
  network.delay = 500;
  const count = network.requests.length;
  await page.getByTestId("reload-seal").click();
  await expect(page.getByTestId("reload-seal")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("End");
  await expect(book(page)).toHaveAttribute("data-current", "0");
  await expect(page.getByTestId("cover")).toContainText("全 12 作品");
  await expect(page.getByTestId("toast")).toContainText(
    "最新の情報に更新しました",
  );
  expect(network.requests).toHaveLength(count + 1);
  expect(network.requests.at(-1)).toContain("t=");
  network.delay = 0;
  network.status = 500;
  await page.getByTestId("reload-seal").click();
  await expect(page.getByTestId("toast")).toContainText("更新できませんでした");
  await expect(page.getByTestId("cover")).toContainText("全 12 作品");
  network.status = 200;
  network.data = fixture("data-empty");
  await page.getByTestId("reload-seal").click();
  await expect(book(page)).toHaveAttribute("data-state", "empty");
  await page.keyboard.press("End");
  await expect(book(page)).toHaveAttribute("data-current", "0");
  network.data = fixture("data-3");
  await page.getByTestId("reload-seal").click();
  await expect(book(page)).toHaveAttribute("data-state", "ready");
  await expect(page.getByTestId("cover")).toContainText("全 3 作品");
});

test("GREEN 36–38: 作品IDでしおりを復元し並び変更に追従", async ({
  page,
  network,
}, info) => {
  await ready(page);
  await go(page, "ArrowRight");
  await page.getByTestId("toc-item").nth(1).click();
  await settled(page);
  const item = network.data.items[1];
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("nsb:bookmark:v1")),
  );
  expect(saved.titleId).toBe(item.titleId);
  expect(saved.period).toBe("2026-11");
  await page.reload();
  await expect(
    page.getByTestId("title-name").filter({ hasText: item.title }),
  ).toBeVisible();
  await expect(page.getByTestId("bookmark-ribbon")).toBeVisible();
  await expect(page.getByTestId("toast")).toContainText("前回の続き");
  await shot(page, info, "bookmark-restored");
  const extra = {
    ...network.data.items[0],
    titleId: "79999",
    title: "追加作品",
    netflixUrl: "https://www.netflix.com/title/79999",
  };
  network.data.items.unshift(extra);
  await page.reload();
  await expect(
    page.getByTestId("title-name").filter({ hasText: item.title }),
  ).toBeVisible();
  await page.getByTestId("toast-to-cover").click();
  await settled(page);
  await expect(page.getByTestId("cover")).toBeVisible();
});

test("補足: めくり中resizeは先へ確定し待機入力を破棄", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await page.getByTestId("next").click();
  await expect(book(page)).toHaveAttribute("data-flipping", "true");
  await page.keyboard.press("ArrowRight");
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(book(page)).toHaveAttribute("data-layout", "spread");
  await settled(page);
  await expect(book(page)).toHaveAttribute("data-current", "1");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(book(page)).toHaveAttribute("data-layout", "single");
  await expect(book(page)).toHaveAttribute("data-current", "1");
});
