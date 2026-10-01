// Minimal 5-field cron matcher ("minute hour day-of-month month day-of-week"), in UTC
// like Trigger.dev's default. Supports *, lists (a,b), ranges (a-b) and steps (*/n, a-b/n).
function fieldMatches(field: string, value: number, min: number, max: number) {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/");
    const step = stepText ? Number(stepText) : 1;
    let [from, to] = [min, max];
    if (range !== "*") {
      const [a, b] = range.split("-").map(Number);
      from = a;
      to = b ?? (stepText ? max : a);
    }
    return value >= from && value <= to && (value - from) % step === 0;
  });
}

export function cronMatches(expression: string, date: Date) {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`Unsupported cron expression "${expression}"`);
  const [minute, hour, dayOfMonth, month, dayOfWeek] = fields;
  const weekday = date.getUTCDay();
  const dayOfMonthOk = fieldMatches(dayOfMonth, date.getUTCDate(), 1, 31);
  // 0 and 7 both mean Sunday.
  const dayOfWeekOk =
    fieldMatches(dayOfWeek, weekday, 0, 7) || (weekday === 0 && fieldMatches(dayOfWeek, 7, 0, 7));
  // Standard cron: when both day fields are restricted, either may match.
  const dayOk =
    dayOfMonth !== "*" && dayOfWeek !== "*" ? dayOfMonthOk || dayOfWeekOk : dayOfMonthOk && dayOfWeekOk;
  return (
    fieldMatches(minute, date.getUTCMinutes(), 0, 59) &&
    fieldMatches(hour, date.getUTCHours(), 0, 23) &&
    fieldMatches(month, date.getUTCMonth() + 1, 1, 12) &&
    dayOk
  );
}
