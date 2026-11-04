import { defineConfig } from "vite";
export default defineConfig({
  base: "/netflix-shinsaku-book/",
  test: { include: ["tests/unit/**/*.test.js"] },
});
