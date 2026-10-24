import { configDefaults, defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    // The package test packs and installs dist; see vitest.package.config.ts.
    exclude: [...configDefaults.exclude, "tests/package/**"],
    setupFiles: ["./tests/helpers/runtime.ts"],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reportsDirectory: `coverage/${process.versions.bun ? "bun" : "node"}`
    }
  }
})
