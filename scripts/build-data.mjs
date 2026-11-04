import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { buildData, RELEASE_URL, WIKI_URL } from "./lib/build.js";
import {
  parseReleases,
  parseReleasePayload,
  parseTitlePage,
} from "./lib/parse.js";
import { validateData } from "../src/lib/schema.js";
const userAgent =
  "netflix-shinsaku-book (+https://github.com/ChihiroNishioka/netflix-shinsaku-book)";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function request(url, headers = {}) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      "Accept-Language": "ja-JP",
      ...headers,
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw Error(`公開情報の HTTP ${response.status}`);
  return response;
}
export async function loadA() {
  const first = parseReleases(
    await (await request(RELEASE_URL, { Cookie: "nflx-region=jp" })).text(),
  );
  let partial = false;
  const items = [...first.items];
  for (let page = 2; page <= Math.min(first.totalPages, 50); page++) {
    try {
      const payload = await (
        await request(
          `https://about.netflix.com/api/data/releases?page=${page}&language=ja&country=JP`,
        )
      ).json();
      const parsed = parseReleasePayload(payload);
      if (parsed.current !== page) throw Error("ページ番号不一致");
      items.push(...parsed.items);
    } catch {
      partial = true;
      break;
    }
  }
  return { items, partial };
}
export async function loadC(period) {
  const query = `SELECT ?netflixId ?label ?date WHERE { ?item wdt:P1874 ?netflixId; wdt:P577 ?date. FILTER(?date >= "${period.start}T00:00:00Z"^^xsd:dateTime && ?date <= "${period.end}T23:59:59Z"^^xsd:dateTime) SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en". ?item rdfs:label ?label. } } LIMIT 100`;
  const response = await request(
    `${WIKI_URL}?query=${encodeURIComponent(query)}&format=json`,
    { Accept: "application/sparql-results+json" },
  );
  const json = await response.json();
  return {
    items: json.results.bindings.map((row) => ({
      videoID: row.netflixId.value,
      title: row.label.value,
      subtitle: null,
      imageUrl: null,
      releaseDate: row.date.value.slice(0, 10),
    })),
  };
}
export async function main() {
  let previous = null;
  const args = process.argv.slice(2);
  const previousPath = args.includes("--prev")
    ? args[args.indexOf("--prev") + 1]
    : process.env.PREVIOUS_DATA_PATH || "public/data.json";
  const outputPath = args.includes("--out")
    ? args[args.indexOf("--out") + 1]
    : "public/data.json";
  try {
    previous = JSON.parse(await readFile(previousPath, "utf8"));
  } catch {
    /* 初回は前回データなし。 */
  }
  let lastRequest = 0;
  const cache = new Map();
  const loadB = async (id) => {
    if (cache.has(id)) return cache.get(id);
    await pause(Math.max(0, 500 - (Date.now() - lastRequest)));
    lastRequest = Date.now();
    const parsed = parseTitlePage(
      await (await request(`https://www.netflix.com/jp/title/${id}`)).text(),
    );
    cache.set(id, parsed);
    return parsed;
  };
  const data = await buildData({ loadA, loadB, loadC, previous });
  const validation = validateData(data);
  if (!validation.ok) throw Error(`出力不可: ${validation.errors.join(", ")}`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `data.json: ${data.items.length}作品 / ${data.status} / ${data.period.label}`,
  );
  if (data.note) console.log(data.note);
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error("データの作成または保存に失敗しました。公開を停止します。");
    process.exitCode = 1;
  });
