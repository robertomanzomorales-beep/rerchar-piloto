const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Santiago",
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

export function chileCsvDateTime(value: Date | string | null | undefined) {
  if (!value) return "";
  const parts = Object.fromEntries(dateTimeFormatter.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function chileCsvDay(value: Date = new Date()) {
  return chileCsvDateTime(value).slice(0, 10);
}
