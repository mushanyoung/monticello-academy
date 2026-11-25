import {
  createContext,
  type MouseEvent,
  type ReactNode,
  use,
  useCallback,
  useDeferredValue,
  useEffect,
  useState,
} from "react";
import { type ApiRequests, ApiRequestsContext } from "./api";

function currentLocation() {
  return {
    search: window.location.search,
    requests: new Map() as ApiRequests,
  };
}

const NavigationContext = createContext<{
  search: string;
  requestedSearch: string;
  pending: boolean;
  navigate: (href: string) => void;
  replaceSearch: (href: string) => void;
  follow: (event: MouseEvent<HTMLAnchorElement>) => void;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [requested, setRequested] = useState(currentLocation);
  const location = useDeferredValue(requested);
  useEffect(() => {
    const restore = () => {
      const next = currentLocation();
      setRequested((previous) =>
        previous.search === next.search ? previous : next,
      );
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const replaceSearch = useCallback((href: string) => {
    const url = new URL(href, window.location.href);
    url.hash = window.location.hash;
    window.history.replaceState(window.history.state, "", url);
    setRequested((previous) => ({ ...previous, search: url.search }));
  }, []);

  const navigate = (href: string) => {
    const url = new URL(href, window.location.href);
    if (url.href === window.location.href) return;
    window.history.pushState(null, "", url);
    setRequested(currentLocation());
  };
  const follow = (event: MouseEvent<HTMLAnchorElement>) => {
    const link = event.currentTarget;
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      (link.target && link.target !== "_self") ||
      link.hasAttribute("download")
    )
      return;
    const url = new URL(link.href);
    if (
      url.origin !== window.location.origin ||
      url.pathname !== window.location.pathname ||
      url.hash
    )
      return;
    event.preventDefault();
    navigate(url.href);
  };

  return (
    <NavigationContext
      value={{
        search: location.search,
        requestedSearch: requested.search,
        pending: requested !== location,
        follow,
        navigate,
        replaceSearch,
      }}
    >
      <ApiRequestsContext value={location.requests}>
        {children}
      </ApiRequestsContext>
    </NavigationContext>
  );
}

export function useNavigation() {
  const navigation = use(NavigationContext);
  if (!navigation) throw new Error("Missing navigation provider");
  return navigation;
}
