export type Calendar = { id: string; name: string };
export type CalendarEvent = { id: string; title: string; start: string; end: string; allDay: boolean; calendarId: string; location?: string };
const colors = ["#ad2937", "#285aab", "#356c55", "#70419d", "#92581e", "#156b78"];
const storageKey = "graphrelay:hidden-calendars";

export function calendarColorsFor(calendars: Calendar[]) {
  return new Map(calendars.map((calendar, index) => [calendar.id, colors[index % colors.length]]));
}

export function hiddenCalendars() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "[]");
    if (Array.isArray(value)) return value.filter((id): id is string => typeof id === "string");
  } catch {
    // Calendar filters still work if browser storage is unavailable.
  }
  return [];
}

export function saveHiddenCalendars(ids: string[]) {
  try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch { /* Optional browser preference. */ }
}

export function monthKey(date: Date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
}
