import { createContext, use, useState } from "react";
import { useLanguage } from "./language";

type ApiResult = { data: unknown; error: string | null };
export type ApiRequests = Map<string, Promise<ApiResult>>;
export const ApiRequestsContext = createContext<ApiRequests | null>(null);

async function load(url: string, reload = false): Promise<ApiResult> {
  try {
    const response = await fetch(url, {
      cache: reload ? "reload" : "default",
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error || "We couldn't open the notebook. Please try again.",
      );
    return { data: result, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : "Unable to load.",
    };
  }
}

function localizedUrl(sourceUrl: string, language: string) {
  const localized = new URL(sourceUrl, window.location.origin);
  localized.searchParams.set("lang", language);
  return `${localized.pathname}${localized.search}`;
}
function requestFor(requests: ApiRequests, url: string) {
  let request = requests.get(url);
  if (!request) {
    request = load(url);
    requests.set(url, request);
  }
  return request;
}
export function useApi<T>(sourceUrl: string, preloadUrl?: string) {
  const { language } = useLanguage();
  const requests = use(ApiRequestsContext);
  if (!requests) throw new Error("Missing API request scope");
  const [, refresh] = useState(0);
  const url = localizedUrl(sourceUrl, language);
  const request = requestFor(requests, url);
  if (preloadUrl) requestFor(requests, localizedUrl(preloadUrl, language));
  const result = use(request);
  return {
    data: result.data as T | null,
    error: result.error,
    retry: () => {
      requests.set(url, load(url, true));
      refresh((version) => version + 1);
    },
  };
}
export function href(params: Record<string, string | number | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") search.set(key, String(value));
  return `/?${search}`;
}
