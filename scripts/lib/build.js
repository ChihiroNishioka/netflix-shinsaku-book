import { validateData } from "../../src/lib/schema.js";
import { japanDate } from "./parse.js";
export const RELEASE_URL = "https://about.netflix.com/ja/new-to-watch";
export const WIKI_URL = "https://query.wikidata.org/sparql";
export function monthPeriod(now) {
  const today = japanDate(now);
  const [year, month] = today.split("-").map(Number);
  return {
    kind: "month",
    label: `${year}年${month}月`,
    start: `${today.slice(0, 7)}-01`,
    end: `${today.slice(0, 7)}-${new Date(Date.UTC(year, month, 0)).getUTCDate()}`,
    timezone: "Asia/Tokyo",
  };
}
export async function buildData({
  now = new Date(),
  loadA,
  loadB,
  loadC,
  previous = null,
}) {
  const stamp = now.toISOString();
  const period = monthPeriod(now);
  let rows,
    partial = false;
  let sources = [];
  let note = null;
  try {
    const result = await loadA(period);
    rows = result.items;
    partial = !!result.partial;
    sources = [
      {
        name: "Netflix 公式 配信予定（日本）",
        url: RELEASE_URL,
        fetchedAt: stamp,
      },
    ];
    if (partial) note = "配信予定の一部のページを取得できませんでした。";
  } catch {
    try {
      const result = await loadC(period);
      if (!result.items.length) throw Error("予備情報0件");
      rows = result.items;
      partial = true;
      sources = [
        { name: "Wikidata（日本配信未確認）", url: WIKI_URL, fetchedAt: stamp },
      ];
      note = "Wikidata の公開日です。日本の配信予定は未確認です。";
    } catch {
      if (validateData(previous).ok)
        return {
          ...previous,
          status: "stale",
          note: "公開情報を取得できず、前回の情報を使用しています。",
        };
      return {
        schemaVersion: 1,
        generatedAt: stamp,
        period,
        region: "JP",
        sources: [
          {
            name: "Netflix 公式 配信予定（取得失敗）",
            url: RELEASE_URL,
            fetchedAt: stamp,
          },
        ],
        status: "empty",
        note: "公式の配信予定と予備情報を取得できず、有効な前回データもありません。",
        items: [],
      };
    }
  }
  const items = new Map();
  for (const row of rows.filter(
    (r) => r.releaseDate >= period.start && r.releaseDate <= period.end,
  )) {
    let detail = {};
    let supplemented = false;
    try {
      detail = await loadB(row.videoID);
      supplemented = true;
      if (!detail.synopsis || !detail.genres?.length || !detail.titleId)
        partial = true;
    } catch {
      partial = true;
    }
    const titleId = detail.titleId || row.videoID;
    const titleUrl = `https://www.netflix.com/jp/title/${row.videoID}`;
    const entry = {
      titleId,
      title: row.title,
      subtitle: row.subtitle || null,
      synopsis: detail.synopsis || null,
      synopsisLang: detail.synopsis ? detail.synopsisLang : null,
      imageUrl: detail.imageUrl || row.imageUrl || null,
      releaseDate: row.releaseDate,
      genres: detail.genres || [],
      netflixUrl: `https://www.netflix.com/title/${titleId}`,
      sourceUrls: [sources[0].url, ...(supplemented ? [titleUrl] : [])],
    };
    const old = items.get(titleId);
    if (!old || entry.releaseDate < old.releaseDate) items.set(titleId, entry);
  }
  const output = {
    schemaVersion: 1,
    generatedAt: stamp,
    period,
    region: "JP",
    sources,
    status: items.size ? (partial ? "partial" : "ok") : "empty",
    note:
      note || (partial ? "一部の作品の補足情報を取得できませんでした。" : null),
    items: [...items.values()].sort(
      (a, b) =>
        a.releaseDate.localeCompare(b.releaseDate) ||
        a.title.localeCompare(b.title, "ja"),
    ),
  };
  const validation = validateData(output);
  if (!validation.ok) {
    console.error(`公開情報の検証エラー: ${validation.errors.join(", ")}`);
    if (validateData(previous).ok)
      return {
        ...previous,
        status: "stale",
        note: "取得した公開情報が検証を通らず、前回の情報を使用しています。",
      };
    return {
      ...output,
      status: "empty",
      note: "取得した公開情報が検証を通らず、作品を掲載できませんでした。",
      items: [],
    };
  }
  return output;
}
