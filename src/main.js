import "./style.css";
import { validateData } from "./lib/schema.js";
import { makePages, currentGroup, step } from "./lib/book.js";
import { chooseLayout } from "./lib/layout.js";
import { restoreBookmark, saveBookmark } from "./lib/bookmark.js";

const app = document.querySelector("#app");
let data,
  pages = [],
  focus = 0,
  layout = chooseLayout(innerWidth, innerHeight);
let state = "loading",
  flipping = false,
  queued = null,
  flipTimer,
  resizing,
  refreshing = false,
  restored = false,
  toastTimer;
let motion = matchMedia("(prefers-reduced-motion: reduce)").matches
  ? "reduced"
  : "full";
let storage;
try {
  storage = localStorage;
} catch {
  storage = null;
}
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const date = (value) =>
  new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo",
  }).format(new Date(`${value}T12:00:00+09:00`));
function group() {
  return currentGroup(pages, focus, layout);
}
function sourceNotice() {
  if (data.sources.some((source) => source.url.includes("wikidata.org")))
    return "日本配信未確認の参考情報です。";
  if (data.status === "stale")
    return "更新に失敗し、前回の情報を表示しています。";
  if (data.status === "partial")
    return "一部の情報を取得できませんでした。出典をご確認ください。";
  return "";
}
function pageHTML(page, index) {
  const folio =
    index > 0 ? `<span class="folio" data-testid="folio">${index}</span>` : "";
  let content = "";
  if (page.kind === "cover")
    content = `<button class="seal" data-testid="reload-seal" aria-label="最新の情報を読み直す" aria-busy="${refreshing}" ${refreshing ? "disabled" : ""}></button><div class="cover-content"><p class="eyebrow">映像と物語のコレクション</p><h1>Netflix新作集</h1><div class="gold-rule"></div><p class="period">${escape(data.period.label)}</p>${data.items.length ? `<p class="count">全 ${data.items.length} 作品</p><span class="ornament" aria-hidden="true">❧</span>` : '<p class="empty-message" data-testid="state-empty">今月の新作は、まだ載っていません。<br>また後で開いてみてください。</p>'}${sourceNotice() ? `<p class="source-note">${escape(sourceNotice())}</p>` : ""}<div class="cover-bottom"><b>N</b>今月、出会う物語</div></div>`;
  if (page.kind === "toc") {
    let previous = "";
    content = `<h2>目次</h2><p class="toc-intro">気になる一作から、お読みください。</p><div class="toc-list">${data.items
      .map((item, i) => {
        const heading =
          item.releaseDate !== previous
            ? `<h3>${date(item.releaseDate)}</h3>`
            : "";
        previous = item.releaseDate;
        return `${heading}<button class="toc-item" data-testid="toc-item" data-target-index="${i + 2}"><small>${item.releaseDate.slice(5).replace("-", "/")}</small><span>${escape(item.title)}</span><small>${i + 2}</small></button>`;
      })
      .join("")}</div>${folio}`;
  }
  if (page.kind === "title") {
    const item = page.item;
    content = `<a class="title-link" data-testid="title-link" href="${escape(item.netflixUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escape(item.title)}をNetflixで開く">${item.imageUrl ? `<img data-testid="title-image" src="${escape(item.imageUrl)}" alt="${escape(item.title)}" loading="lazy" referrerpolicy="no-referrer">` : `<div class="image-fallback" data-testid="image-fallback">${escape(item.title)}</div>`}</a><div class="title-copy"><h2 data-testid="title-name">${escape(item.title)}</h2><p class="metadata"><span data-testid="release-date">${date(item.releaseDate)} 配信</span><br><span data-testid="genres">${escape(item.genres.join("・") || "ジャンル未定")}</span></p><p class="synopsis" data-testid="synopsis" ${item.synopsisLang ? `lang="${item.synopsisLang}"` : ""}>${escape(item.synopsis ?? "あらすじは、まだ公開されていません。")}</p></div>${folio}`;
  }
  if (page.kind === "back-cover")
    content = `<div class="back-content"><p class="eyebrow">物語は、ここから。</p><h2>Netflix新作集</h2><div class="gold-rule" style="margin:20px auto"></div>${data.sources.map((source) => `<p>出典：<a target="_blank" rel="noopener noreferrer" href="${escape(source.url)}">${escape(source.name)}</a></p>`).join("")}${sourceNotice() ? `<p>${escape(sourceNotice())}</p>` : ""}<time>更新 ${escape(new Date(data.generatedAt).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }))}</time><p>Netflix の非公式作品案内</p></div>${folio}`;
  const testid = {
    cover: "cover",
    toc: "toc",
    title: "title-page",
    endpaper: "endpaper",
    "back-cover": "back-cover",
  }[page.kind];
  return `<section class="page ${page.kind}" data-page-kind="${page.kind}" data-page-index="${index}" data-testid="${testid}" ${page.kind === "endpaper" ? 'aria-label="見返し"' : ""}>${content}</section>`;
}
function announce() {
  const indices = group();
  return indices
    .map((index) => {
      const page = pages[index];
      return page.kind === "cover"
        ? "表紙"
        : `${index}ページ、${page.item?.title ?? { toc: "目次", endpaper: "見返し", "back-cover": "裏表紙" }[page.kind]}`;
    })
    .join("、");
}
function render() {
  if (!data) {
    app.innerHTML = `<div class="stage"><div class="book" data-testid="book" data-layout="${layout}" data-current="0" data-flipping="false" data-motion="${motion}" data-state="${state}"><section class="page cover state-message">${state === "error" ? '<div data-testid="state-error" role="alert"><h2>本を開けませんでした</h2><p>通信の具合を確かめて、もう一度お試しください。</p><button data-testid="retry">もう一度読む</button></div>' : '<div data-testid="state-loading" role="status">本を用意しています…</div>'}</section></div></div>`;
    app
      .querySelector("[data-testid=retry]")
      ?.addEventListener("click", () => load(true));
    return;
  }
  const indices = group();
  const closed = indices.length === 1;
  app.innerHTML = `<div class="stage ${layout}"><div class="book" data-testid="book" data-layout="${layout}" data-current="${indices[0]}" data-flipping="${flipping}" data-motion="${motion}" data-state="${state}"><div class="sheets ${closed ? "closed" : ""} ${focus === pages.length - 1 ? "back" : ""}">${indices.map((i) => pageHTML(pages[i], i)).join("")}</div>${focus > 0 && data.items.length ? '<button class="ribbon" data-testid="toc-button" aria-label="目次を開く">目次</button>' : ""}${restored ? '<span class="ribbon bookmark-ribbon" data-testid="bookmark-ribbon" aria-hidden="true"></span>' : ""}</div></div><nav class="controls" aria-label="ページの操作"><button data-testid="prev" aria-label="前のページへ" ${focus === 0 || !data.items.length ? "disabled" : ""}>← 前へ</button><span class="position" data-testid="position">${focus === 0 ? "表紙" : `${indices.at(-1)} / ${pages.length - 1}`}</span><button data-testid="next" aria-label="次のページへ" ${focus === pages.length - 1 || !data.items.length ? "disabled" : ""}>次へ →</button></nav><div class="toast" data-testid="toast" role="status"></div><p class="sr-only" data-testid="announcer" aria-live="polite">${announce()}</p>`;
  app.querySelector("[data-testid=prev]").onclick = () => navigate("prev");
  app.querySelector("[data-testid=next]").onclick = () => navigate("next");
  app
    .querySelector("[data-testid=toc-button]")
    ?.addEventListener("click", () => navigate(1));
  app
    .querySelector("[data-testid=reload-seal]")
    ?.addEventListener("click", () => load(true, true));
  app
    .querySelectorAll("[data-target-index]")
    .forEach(
      (button) =>
        (button.onclick = () => navigate(Number(button.dataset.targetIndex))),
    );
  app.querySelectorAll("img").forEach(
    (img) =>
      (img.onerror = () => {
        const fallback = document.createElement("div");
        fallback.className = "image-fallback";
        fallback.dataset.testid = "image-fallback";
        fallback.textContent = img.alt;
        img.replaceWith(fallback);
      }),
  );
  wireGestures();
}
function toast(text, bookmark = false) {
  const box = app.querySelector("[data-testid=toast]");
  if (!box) return;
  box.textContent = text;
  if (bookmark) {
    const button = document.createElement("button");
    button.dataset.testid = "toast-to-cover";
    button.textContent = "表紙へ";
    button.onclick = () => navigate(0);
    box.append(button);
  }
  clearTimeout(toastTimer);
  if (!bookmark)
    toastTimer = setTimeout(() => {
      if (box.isConnected) box.textContent = "";
    }, 3000);
}
function finish() {
  clearTimeout(flipTimer);
  flipping = false;
  saveBookmark(storage, data, pages, focus);
  render();
  const next = queued;
  queued = null;
  if (next !== null) navigate(next);
}
function navigate(command) {
  if (!data?.items.length || refreshing) return;
  if (flipping) {
    if (queued === null) queued = command;
    return;
  }
  const target =
    typeof command === "number" ? command : step(pages, focus, layout, command);
  if (group().includes(target)) {
    if (typeof command === "number") {
      focus = target;
      saveBookmark(storage, data, pages, focus);
    }
    return;
  }
  const oldIndex = group().at(-1),
    oldPage = pages[oldIndex],
    reverse = target < focus;
  focus = target;
  flipping = true;
  restored = false;
  render();
  const leaf = document.createElement("div");
  leaf.className = `leaf${reverse ? " reverse" : ""}`;
  leaf.innerHTML = `<div class="leaf-front">${pageHTML(oldPage, oldIndex)}</div><div class="leaf-back"></div>`;
  leaf.setAttribute("aria-hidden", "true");
  leaf
    .querySelectorAll("[data-testid],[data-page-kind],[data-page-index]")
    .forEach((node) => {
      node.removeAttribute("data-testid");
      node.removeAttribute("data-page-kind");
      node.removeAttribute("data-page-index");
    });
  app.querySelector(".book").append(leaf);
  flipTimer = setTimeout(finish, motion === "reduced" ? 150 : 700);
}
function wireGestures() {
  const book = app.querySelector(".book");
  let start = null,
    swiped = false;
  const interactive = (target) => target.closest("a,button,.toc-list");
  book.addEventListener("pointerdown", (event) => {
    if (interactive(event.target)) return;
    start = { x: event.clientX, y: event.clientY };
    swiped = false;
  });
  book.addEventListener("pointermove", (event) => {
    if (!start || flipping) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (Math.abs(dx) > Math.abs(dy))
      book.querySelector(".sheets").style.transform =
        `perspective(2000px) rotateY(${Math.max(-8, Math.min(8, dx / 15))}deg)`;
  });
  book.addEventListener("pointerup", (event) => {
    book.querySelector(".sheets").style.transform = "";
    if (!start) return;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    start = null;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) {
      swiped = true;
      navigate(dx < 0 ? "next" : "prev");
    }
  });
  book.addEventListener("pointercancel", () => {
    start = null;
    book.querySelector(".sheets").style.transform = "";
  });
  book.addEventListener("click", (event) => {
    if (swiped) {
      swiped = false;
      return;
    }
    if (interactive(event.target)) return;
    const bounds = book.getBoundingClientRect();
    navigate(event.clientX - bounds.left > bounds.width / 2 ? "next" : "prev");
  });
}
async function load(fresh = false, refresh = false) {
  if (refreshing) return;
  refreshing = refresh;
  if (refresh) render();
  let loadingTimer;
  if (!data) {
    app.innerHTML = "";
    loadingTimer = setTimeout(() => {
      state = "loading";
      render();
    }, 300);
  }
  const controller = new AbortController();
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new Error("読込期限切れ"));
    }, 10000);
  });
  try {
    const response = await Promise.race([
      fetch(
        `${import.meta.env.BASE_URL}data.json${fresh ? `?t=${Date.now()}` : ""}`,
        { cache: fresh ? "no-store" : "default", signal: controller.signal },
      ),
      deadline,
    ]);
    if (response.status !== 200) throw Error("読込応答が不正");
    const next = await Promise.race([response.json(), deadline]);
    if (!validateData(next).ok) throw Error("データの形式が不正");
    if (controller.signal.aborted) throw Error("読込期限切れ");
    clearTimeout(flipTimer);
    queued = null;
    flipping = false;
    data = next;
    pages = makePages(data.items, layout);
    state = data.items.length ? "ready" : "empty";
    focus = refresh ? 0 : restoreBookmark(storage, data, pages);
    restored = focus > 0;
    refreshing = false;
    render();
    if (refresh) {
      saveBookmark(storage, data, pages, 0);
      toast("最新の情報に更新しました");
    } else if (restored)
      toast(`前回の続き（${focus}ページ）から開きました`, true);
  } catch (error) {
    console.warn(
      error.name === "AbortError" ? "読込期限切れ" : "読み込みに失敗しました",
    );
    refreshing = false;
    if (data) {
      render();
      toast("更新できませんでした。しばらくしてからお試しください");
    } else {
      state = "error";
      render();
    }
  } finally {
    clearTimeout(timeout);
    clearTimeout(loadingTimer);
  }
}
addEventListener("keydown", (event) => {
  if (event.target.closest("input,textarea,select")) return;
  const commands = {
    ArrowRight: "next",
    ArrowLeft: "prev",
    Home: 0,
    End: pages.length - 1,
  };
  if (event.key in commands) {
    event.preventDefault();
    navigate(commands[event.key]);
  }
});
addEventListener("resize", () => {
  clearTimeout(resizing);
  resizing = setTimeout(() => {
    const next = chooseLayout(innerWidth, innerHeight);
    if (next === layout) return;
    const old = pages[focus];
    clearTimeout(flipTimer);
    flipping = false;
    queued = null;
    layout = next;
    if (data) {
      pages = makePages(data.items, layout);
      if (old?.kind === "back-cover") focus = pages.length - 1;
      else if (old?.kind === "endpaper") focus = 0;
      render();
      saveBookmark(storage, data, pages, focus);
    }
  }, 150);
});
matchMedia("(prefers-reduced-motion: reduce)").addEventListener(
  "change",
  (event) => {
    motion = event.matches ? "reduced" : "full";
    if (data) {
      if (flipping) {
        queued = null;
        finish();
      } else render();
    }
  },
);
load();
