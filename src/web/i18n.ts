import type { ClassId } from "../shared/classes";
import { useLanguage } from "./language";
import { type MessageKey, messages } from "./messages";

const classroomNames = {
  sunshine: { en: "Sunshine Room", zh: "阳光班" },
  guppy: { en: "Guppy Room", zh: "小鱼班" },
  twos: { en: "Twos Town", zh: "两岁班" },
} as const;
export function useI18n() {
  const { language, setLanguage } = useLanguage();
  const t = (key: MessageKey, values: Record<string, string | number> = {}) => {
    const template = language === "zh" ? messages[key] : key;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      String(values[name] ?? match),
    );
  };
  const displayDate = (
    date: string,
    options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" },
  ) =>
    new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
      ...options,
      timeZone: "America/Los_Angeles",
    }).format(new Date(date.length === 10 ? `${date}T12:00:00-08:00` : date));
  return {
    language,
    setLanguage,
    t,
    displayDate,
    className: (id: ClassId) => classroomNames[id][language],
  };
}
