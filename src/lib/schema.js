const record = (x) => x !== null && typeof x === "object" && !Array.isArray(x);
const text = (x) => typeof x === "string" && x.trim().length > 0;
const https = (x) => {
  try {
    return new URL(x).protocol === "https:";
  } catch {
    return false;
  }
};
const date = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(x) &&
  !Number.isNaN(Date.parse(x)) &&
  new Date(x).toISOString().slice(0, 10) === x;
const timestamp = (x) =>
  typeof x === "string" &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
    x,
  ) &&
  date(x.slice(0, 10)) &&
  Number.isFinite(Date.parse(x));
export function validateData(data) {
  const errors = [];
  const check = (condition, path) => {
    if (!condition) errors.push(path);
  };
  const shape = (obj, keys, path) => {
    if (!record(obj)) {
      errors.push(path);
      return false;
    }
    for (const key of keys) check(Object.hasOwn(obj, key), `${path}.${key}`);
    for (const key of Object.keys(obj))
      check(keys.includes(key), `${path}.${key}`);
    return true;
  };
  if (
    !shape(
      data,
      [
        "schemaVersion",
        "generatedAt",
        "period",
        "region",
        "sources",
        "status",
        "note",
        "items",
      ],
      "data",
    )
  )
    return { ok: false, errors };
  check(data.schemaVersion === 1, "schemaVersion");
  check(timestamp(data.generatedAt), "generatedAt");
  check(data.region === "JP", "region");
  check(["ok", "partial", "stale", "empty"].includes(data.status), "status");
  check(data.note === null || text(data.note), "note");
  if (
    shape(data.period, ["kind", "label", "start", "end", "timezone"], "period")
  ) {
    check(["month", "week"].includes(data.period.kind), "period.kind");
    check(text(data.period.label), "period.label");
    check(date(data.period.start), "period.start");
    check(date(data.period.end), "period.end");
    check(data.period.start <= data.period.end, "period.range");
    check(data.period.timezone === "Asia/Tokyo", "period.timezone");
  }
  check(Array.isArray(data.sources) && data.sources.length > 0, "sources");
  if (Array.isArray(data.sources))
    data.sources.forEach((s, i) => {
      if (shape(s, ["name", "url", "fetchedAt"], `sources[${i}]`)) {
        check(text(s.name), `sources[${i}].name`);
        check(https(s.url), `sources[${i}].url`);
        check(timestamp(s.fetchedAt), `sources[${i}].fetchedAt`);
      }
    });
  check(Array.isArray(data.items), "items");
  const ids = new Set();
  if (Array.isArray(data.items)) {
    check(
      data.status === "empty"
        ? data.items.length === 0
        : data.status === "stale" || data.items.length > 0,
      "status.items",
    );
    data.items.forEach((item, i) => {
      const p = `items[${i}]`;
      if (
        !shape(
          item,
          [
            "titleId",
            "title",
            "subtitle",
            "synopsis",
            "synopsisLang",
            "imageUrl",
            "releaseDate",
            "genres",
            "netflixUrl",
            "sourceUrls",
          ],
          p,
        )
      )
        return;
      check(
        typeof item.titleId === "string" &&
          /^\d{5,10}$/.test(item.titleId) &&
          !ids.has(item.titleId),
        `${p}.titleId`,
      );
      ids.add(item.titleId);
      check(text(item.title), `${p}.title`);
      check(item.subtitle === null || text(item.subtitle), `${p}.subtitle`);
      check(
        item.synopsis === null
          ? item.synopsisLang === null
          : text(item.synopsis) && ["ja", "en"].includes(item.synopsisLang),
        `${p}.synopsisLang`,
      );
      check(item.imageUrl === null || https(item.imageUrl), `${p}.imageUrl`);
      check(
        date(item.releaseDate) &&
          item.releaseDate >= data.period?.start &&
          item.releaseDate <= data.period?.end,
        `${p}.releaseDate`,
      );
      check(
        Array.isArray(item.genres) && item.genres.every(text),
        `${p}.genres`,
      );
      check(
        item.netflixUrl === `https://www.netflix.com/title/${item.titleId}`,
        `${p}.netflixUrl`,
      );
      check(
        Array.isArray(item.sourceUrls) &&
          item.sourceUrls.length > 0 &&
          item.sourceUrls.every(https),
        `${p}.sourceUrls`,
      );
    });
  }
  return { ok: errors.length === 0, errors };
}
