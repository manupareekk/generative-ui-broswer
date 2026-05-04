/**
 * Load `.env` from the package root (next to `package.json`), not only `process.cwd()`.
 * Fixes SVG-stub fallback when dev tools run the server from another working directory.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..", "..");
dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config();
