// Lint warns and never gates CI (FRD §9.5): typecheck and build are the real gates.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig(
  globalIgnores([
    "**/node_modules/",
    "**/.next/",
    "**/coverage/",
    "**/playwright-report/",
    "**/test-results/",
    "**/next-env.d.ts",
  ]),
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", destructuredArrayIgnorePattern: "^_" },
      ],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  ...nextCoreWebVitals,
  { settings: { next: { rootDir: import.meta.dirname } } },
);
