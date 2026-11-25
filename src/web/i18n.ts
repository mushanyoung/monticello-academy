import type { ClassId } from "../shared/classes";
import { CAMPUS_TIME_ZONE } from "../shared/dates";
import { useLanguage } from "./language";
import { type MessageKey, messages } from "./messages";

const classroomNames = {
  sunshine: { en: "Sunshine Room", zh: "阳光班" },
  guppy: { en: "Guppy Room", zh: "小鱼班" },
  twos: { en: "Twos Town", zh: "两岁班" },
} as const;
function dateValue(date: string) {
  return new Date(date.length === 10 ? `${date}T12:00:00-08:00` : date);
}
export function useI18n() {
  const { language, setLanguage } = useLanguage();
  const t = (key: MessageKey, values: Record<string, string | number> = {}) => {
    const template = language === "zh" ? messages[key] : key;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      String(values[name] ?? match),
    );
  };
  const formatter = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
      ...options,
      timeZone: CAMPUS_TIME_ZONE,
    });
  const displayDate = (
    date: string,
    options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
  ) => formatter(options).format(dateValue(date));
  const displayDateRange = (start: string, end: string) => {
    const options: Intl.DateTimeFormatOptions = {
      month: "short",
      day: "numeric",
    };
    if (start.slice(0, 4) !== end.slice(0, 4)) options.year = "numeric";
    if (language === "en")
      return formatter(options).formatRange(dateValue(start), dateValue(end));
    const first = displayDate(start, options);
    if (start === end) return first;
    return t("{start} – {end}", {
      start: first,
      end: displayDate(
        end,
        start.slice(0, 7) === end.slice(0, 7) ? { day: "numeric" } : options,
      ),
    });
  };
  return {
    language,
    setLanguage,
    t,
    displayDate,
    displayDateRange,
    className: (id: ClassId) => classroomNames[id][language],
  };
}
