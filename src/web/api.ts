import { useEffect, useState } from "react";
import { useLanguage } from "./language";
export function useApi<T>(sourceUrl: string) {
  const { language } = useLanguage();
  const localized = new URL(sourceUrl, window.location.origin);
  localized.searchParams.set("lang", language);
  const url = `${localized.pathname}${localized.search}`;
  const [state, setState] = useState<{
    url: string;
    data: T | null;
    error: string | null;
  }>({ url: "", data: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState({ url, data: null, error: null });
    async function load() {
      try {
        const response = await fetch(url, {
          signal: controller.signal,
          cache: version > 0 ? "reload" : "default",
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error || "We couldn't open the notebook. Please try again.",
          );
        if (!controller.signal.aborted)
          setState({ url, data: result, error: null });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            url,
            data: null,
            error: error instanceof Error ? error.message : "Unable to load.",
          });
      }
    }
    void load();
    return () => controller.abort();
  }, [url, version]);
  return {
    data: state.url === url ? state.data : null,
    error: state.url === url ? state.error : null,
    retry: () => setVersion((v) => v + 1),
  };
}
export function href(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") search.set(key, String(value));
  return `/?${search}`;
}
