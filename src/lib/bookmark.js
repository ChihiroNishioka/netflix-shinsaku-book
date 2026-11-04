const key = "nsb:bookmark:v1";
export function restoreBookmark(storage, data, pages) {
  try {
    if (!data.items.length) return 0;
    const mark = JSON.parse(storage.getItem(key));
    if (!mark || typeof mark !== "object") return 0;
    if (mark.period !== data.period.start.slice(0, 7)) {
      storage.removeItem(key);
      return 0;
    }
    if (typeof mark.titleId === "string") {
      const index = pages.findIndex(
        (page) => page.item?.titleId === mark.titleId,
      );
      return index < 0 ? 0 : index;
    }
    return mark.titleId === null &&
      Number.isInteger(mark.index) &&
      mark.index >= 0 &&
      mark.index < pages.length &&
      pages[mark.index].kind !== "endpaper"
      ? mark.index
      : 0;
  } catch {
    return 0;
  }
}
export function saveBookmark(storage, data, pages, index) {
  try {
    storage.setItem(
      key,
      JSON.stringify({
        period: data.period.start.slice(0, 7),
        titleId: pages[index]?.item?.titleId ?? null,
        index: pages[index]?.kind === "endpaper" ? 0 : index,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    /* 保存できない環境でも本を読める。 */
  }
}
