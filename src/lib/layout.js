export const chooseLayout = (width, height) =>
  width >= 700 && width / height >= 3 / 4 ? "spread" : "single";
