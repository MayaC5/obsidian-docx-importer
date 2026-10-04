import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  {
    ignores: ["main.js", "node_modules/**", "build-shims/**"],
  },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.*",
            "esbuild.config.mjs",
            "build-compat*.mjs",
            "vitest.config.mts",
          ],
        },
      },
    },
    rules: {
      "obsidianmd/ui/sentence-case": ["warn", {
        acronyms: ["DOCX", "HTML"],
        brands: ["Markdown"],
        enforceCamelCaseLower: true,
      }],
    },
  },
]);
