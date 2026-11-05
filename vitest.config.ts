import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const alias = {
  "@": path.resolve(__dirname, "src"),
  // `server-only` throws outside the React server runtime; tests are server code.
  "server-only": path.resolve(__dirname, "tests/stubs/empty.ts"),
};

export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: "ui",
          environment: "jsdom",
          setupFiles: ["./tests/setup.ts"],
          include: ["tests/*.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "server",
          environment: "node",
          include: ["tests/server/**/*.test.ts"],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            NODE_ENV: "test",
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://postgres@localhost:54329/moonuke_test",
            MOONUKE_SECRET: "test-secret-test-secret-test-secret-0000",
          },
        },
      },
    ],
  },
});
