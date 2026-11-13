import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  isLanguage,
  type Language,
  preferredLanguage,
} from "../shared/language";

const STORAGE_KEY = "monticello-language";
const LanguageContext = createContext<{
  language: Language;
  setLanguage: (value: Language) => void;
}>({ language: "zh", setLanguage: () => {} });
function initialLanguage() {
  let saved: unknown;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* Private browsing may disallow storage. */
  }
  return preferredLanguage(
    navigator.languages?.length
      ? navigator.languages
      : navigator.language
        ? [navigator.language]
        : [],
    saved,
  );
}
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setCurrent] = useState<Language>(initialLanguage);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && isLanguage(event.newValue))
        setCurrent(event.newValue);
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  const setLanguage = (value: Language) => {
    setCurrent(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* The current tab still switches without persistence. */
    }
  };
  return (
    <LanguageContext value={{ language, setLanguage }}>
      {children}
    </LanguageContext>
  );
}
export function useLanguage() {
  return useContext(LanguageContext);
}
export function LanguageSwitch() {
  const { language, setLanguage } = useLanguage();
  return (
    <fieldset
      className="language-switch"
      aria-label={language === "zh" ? "网站语言" : "Website language"}
    >
      <button
        type="button"
        lang="zh-CN"
        aria-pressed={language === "zh"}
        onClick={() => setLanguage("zh")}
      >
        中文
      </button>
      <button
        type="button"
        lang="en"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        English
      </button>
    </fieldset>
  );
}
