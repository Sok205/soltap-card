import { defineConfig } from "vitest/config";
import { createRequire } from "module";

// Resolve the path to the local CJS build of @noble/hashes/sha3 so that
// Vite's bundler can find it. @noble/hashes 2.x removed the extensionless
// subpath exports (e.g. './sha3'), breaking ESM resolution in test environments.
// Aliasing directly to the CJS file bypasses the exports-map restriction.
const req = createRequire(import.meta.url);
const sha3Path = req.resolve("@noble/hashes/sha3.js");

export default defineConfig({
  resolve: {
    alias: {
      // Map '@noble/hashes/sha3' (no extension, used by mpl-core's CJS require)
      // to the actual file when bundled through Vite in test.
      "@noble/hashes/sha3": sha3Path,
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // @metaplex-foundation and @solana packages ship CJS-in-ESM barrels that
    // need to be pre-bundled so vitest's module evaluator can handle them.
    server: {
      deps: {
        inline: [/@metaplex-foundation\//, /@solana\//],
      },
    },
  },
});
