import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  fmt: {
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    semi: true,
    singleQuote: false,
    trailingComma: "all",
    endOfLine: "lf",
  },
  lint: {
    ignorePatterns: ["**/dist/**"],
    plugins: ["typescript", "oxc"],
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
      "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
      "typescript/no-restricted-types": [
        "error",
        {
          types: {
            Pick: "Declare an interface instead.",
            Omit: "Declare an interface instead.",
          },
        },
      ],
    },
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
        files: ["apps/web/src/components/ui/**"],
        rules: { "typescript/no-restricted-types": "off" },
      },
      {
        files: ["apps/api/**", "apps/compiler/**"],
        env: { node: true },
      },
      {
        files: ["**/tests/**", "**/*.test.ts", "**/*.test.tsx"],
        rules: { "typescript/consistent-type-assertions": "off" },
      },
    ],
  },
  run: {
    cache: true,
  },
});
