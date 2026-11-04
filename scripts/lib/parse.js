const decode = (x) =>
  x
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
export function japanDate(value) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" }).format(
    new Date(value),
  );
}
export function parseReleases(html) {
  const raw = html.match(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!raw) throw Error("配信予定の構造を確認できません");
  return parseReleasePayload(JSON.parse(raw[1]).props?.pageProps?.data);
}
export function parseReleasePayload(payload) {
  if (
    !Array.isArray(payload?.data) ||
    !Number.isInteger(payload.totalPages) ||
    !Number.isInteger(payload.current)
  )
    throw Error("配信予定データの構造が変わりました");
  if (payload.data.length && !payload.data.some((x) => x.country === "JP"))
    throw Error("日本向けの配信予定ではありません");
  const items = payload.data
    .filter((x) => x.country === "JP")
    .map((x) => {
      if (
        !/^\d{5,10}$/.test(String(x.videoID)) ||
        typeof x.title1 !== "string" ||
        !Number.isFinite(x.startTime)
      )
        throw Error("作品情報が不正です");
      return {
        videoID: String(x.videoID),
        title: x.title1,
        subtitle: x.title2 && x.title2 !== x.title1 ? x.title2 : null,
        releaseDate: japanDate(x.startTime),
        imageUrl:
          typeof x.image === "string" && x.image.startsWith("https://")
            ? x.image
            : null,
      };
    });
  return { items, totalPages: payload.totalPages, current: payload.current };
}
export function parseTitlePage(html) {
  const metas = {};
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = Object.fromEntries(
      [...m[0].matchAll(/([\w:-]+)\s*=\s*(["'])([\s\S]*?)\2/g)].map((x) => [
        x[1],
        decode(x[3]),
      ]),
    );
    if (attrs.property) metas[attrs.property] = attrs.content;
  }
  let ld = {};
  for (const m of html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    try {
      const v = JSON.parse(m[1]);
      const entries = Array.isArray(v) ? v : v["@graph"] || [v];
      const found = entries.find((x) =>
        ["Movie", "TVSeries", "VideoGame", "CreativeWork"].includes(x["@type"]),
      );
      if (found) {
        ld = found;
        break;
      }
    } catch {
      /* 他のJSON-LDブロックも確認する。 */
    }
  }
  const synopsis = ld.description || metas["og:description"] || null;
  const image = Array.isArray(ld.image) ? ld.image[0] : ld.image;
  const imageUrl =
    typeof image === "object" ? image?.url : image || metas["og:image"] || null;
  return {
    titleId:
      ld.url?.match(/netflix\.com\/(?:jp\/)?title\/(\d{5,10})/)?.[1] || null,
    synopsis,
    synopsisLang: synopsis
      ? /[\u3040-\u30ff\u3400-\u9fff]/.test(synopsis)
        ? "ja"
        : "en"
      : null,
    genres: (Array.isArray(ld.genre)
      ? ld.genre
      : ld.genre
        ? [ld.genre]
        : []
    ).filter(
      (x) => typeof x === "string" && /[\u3040-\u30ff\u3400-\u9fff]/.test(x),
    ),
    imageUrl:
      typeof imageUrl === "string" && imageUrl.startsWith("https://")
        ? imageUrl
        : null,
  };
}
