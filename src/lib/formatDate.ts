// Short human dates for leftover expiry and cook log rows — "Sun 19" style,
// per the §5.7 Cook Complete mockup.
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAYS_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formatShortDate(iso: string): string {
  const date = new Date(iso);
  return `${WEEKDAYS[date.getDay()]} ${date.getDate()}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// The house date format (§1.3-adjacent house convention): DD/MM/YYYY,
// everywhere a numeric date is shown to the user. Never MM/DD — this app
// has exactly two users and they're both Irish. Accepts a YYYY-MM-DD date
// key or a full ISO instant.
export function formatDMY(dateLike: string): string {
  const date = dateLike.length <= 10 ? new Date(`${dateLike}T00:00:00`) : new Date(dateLike);
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
}

// "Monday, 20/07/2026" — the calendar day-sheet heading format.
export function formatDayHeading(dateLike: string): string {
  const date = dateLike.length <= 10 ? new Date(`${dateLike}T00:00:00`) : new Date(dateLike);
  return `${WEEKDAYS_FULL[date.getDay()]}, ${formatDMY(dateLike)}`;
}

// YYYY-MM-DD for the retroactive "I already cooked this" date field.
export function toDateInputValue(iso: string): string {
  return iso.slice(0, 10);
}

// Combines a YYYY-MM-DD date with the current time-of-day into an ISO
// instant. Used when the user picks a past date but we still want a
// meaningful cooked_at timestamp rather than midnight.
export function dateInputToIso(dateInput: string, now: Date = new Date()): string {
  const [year, month, day] = dateInput.split('-').map(Number);
  const combined = new Date(year, (month ?? 1) - 1, day ?? 1, now.getHours(), now.getMinutes(), now.getSeconds());
  return combined.toISOString();
}

// The device's local calendar day as YYYY-MM-DD — distinct from slicing an
// ISO instant (which is UTC and drifts a day near midnight in non-UTC
// timezones). Used anywhere "today" needs to key a cache or a query by local
// date: the daily recommendation cache (§6.1) and today's planned_meal (§5.2).
export function localDateKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
