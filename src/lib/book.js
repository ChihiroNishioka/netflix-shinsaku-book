export function makePages(items, layout) {
  const pages = [
    { kind: "cover" },
    { kind: "toc" },
    ...items.map((item) => ({ kind: "title", item })),
  ];
  if (layout === "spread" && (pages.length - 1) % 2)
    pages.push({ kind: "endpaper" });
  return [...pages, { kind: "back-cover" }];
}
export function spreads(pages) {
  const groups = [[0]];
  for (let index = 1; index < pages.length - 1; index += 2)
    groups.push([index, index + 1]);
  groups.push([pages.length - 1]);
  return groups;
}
export function currentGroup(pages, focus, layout) {
  return layout === "single"
    ? [focus]
    : (spreads(pages).find((group) => group.includes(focus)) ?? [0]);
}
export function step(pages, focus, layout, direction) {
  const groups =
    layout === "spread" ? spreads(pages) : pages.map((_, index) => [index]);
  const index = groups.findIndex((group) => group.includes(focus));
  const target =
    groups[
      Math.max(
        0,
        Math.min(groups.length - 1, index + (direction === "next" ? 1 : -1)),
      )
    ];
  return target.at(-1);
}
