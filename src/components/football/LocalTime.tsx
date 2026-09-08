"use client";

import { useSyncExternalStore } from "react";

function subscribe() {
  return () => {};
}

function getTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export default function LocalTime({ value }: { value: string }) {
  const timezone = useSyncExternalStore(
    subscribe,
    getTimezone,
    () => "UTC",
  );

  const formatted = new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));

  return (
    <time dateTime={value}>
      {formatted} · {timezone}
    </time>
  );
}