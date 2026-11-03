import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {},
  lint: {
    ignorePatterns: ["**/dist/**"],
    plugins: ["typescript", "oxc"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["apps/web/**"],
        plugins: ["react"],
        env: { browser: true },
        rules: {
          "react/rules-of-hooks": "error",
          "react/only-export-components": ["warn", { allowConstantExport: true }],
        },
      },
      {
        files: ["apps/api/**", "apps/compiler/**"],
        env: { node: true },
      },
    ],
  },
  run: {
    cache: true,
  },
});
