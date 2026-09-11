export type DictazFixtureStatus =
  | "scheduled"
  | "live"
  | "halftime"
  | "finished"
  | "postponed"
  | "cancelled"
  | "suspended"
  | "abandoned"
  | "awarded"
  | "unknown";

const LIVE_STATUSES =
  new Set<string>([
    "1H",
    "2H",
    "ET",
    "P",
    "BT",
    "LIVE",
  ]);

const FINISHED_STATUSES =
  new Set<string>([
    "FT",
    "AET",
    "PEN",
  ]);

export function mapApiFootballFixtureStatus(
  statusShort: string,
): DictazFixtureStatus {
  const status =
    statusShort
      .trim()
      .toUpperCase();

  if (
    status === "NS" ||
    status === "TBD"
  ) {
    return "scheduled";
  }

  if (
    LIVE_STATUSES.has(
      status,
    )
  ) {
    return "live";
  }

  if (
    status === "HT"
  ) {
    return "halftime";
  }

  if (
    FINISHED_STATUSES.has(
      status,
    )
  ) {
    return "finished";
  }

  switch (
    status
  ) {
    case "PST":
      return "postponed";

    case "CANC":
      return "cancelled";

    case "SUSP":
    case "INT":
      return "suspended";

    case "ABD":
      return "abandoned";

    case "AWD":
    case "WO":
      return "awarded";

    default:
      return "unknown";
  }
}

export function isApiFootballRegulationFinal(
  statusShort: string,
): boolean {
  return FINISHED_STATUSES.has(
    statusShort
      .trim()
      .toUpperCase(),
  );
}