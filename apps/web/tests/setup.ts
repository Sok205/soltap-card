import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

// Find .env by walking up from cwd (handles both apps/web and repo root invocation)
let dir = process.cwd();
for (let i = 0; i < 6; i++) {
  const candidate = path.join(dir, '.env');
  if (fs.existsSync(candidate)) {
    config({ path: candidate });
    break;
  }
  const parent = path.dirname(dir);
  if (parent === dir) break;
  dir = parent;
}
