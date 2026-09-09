import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const root =
  process.cwd();

const localEnv =
  resolve(
    root,
    ".env.local",
  );

const defaultEnv =
  resolve(
    root,
    ".env",
  );

/*
 * Next.js convention:
 *
 * .env.local has priority for local secrets.
 * .env is used only as a fallback.
 *
 * Neither file's values are overwritten by
 * subsequently loaded files.
 */
if (
  existsSync(localEnv)
) {
  config({
    path: localEnv,
    override: false,
  });
}

if (
  existsSync(defaultEnv)
) {
  config({
    path: defaultEnv,
    override: false,
  });
}