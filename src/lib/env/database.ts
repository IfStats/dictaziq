export function getDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error(
      "DATABASE_URL is missing. Configure it in the root .env.local file.",
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL URL.");
  }

  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    url.pathname.length <= 1
  ) {
    throw new Error(
      "DATABASE_URL must include a PostgreSQL host and database name.",
    );
  }

  return value;
}