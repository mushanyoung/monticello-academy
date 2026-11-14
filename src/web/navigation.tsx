import {
  createContext,
  type MouseEvent,
  type ReactNode,
  use,
  useEffect,
  useState,
  useTransition,
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
  pending: boolean;
  follow: (event: MouseEvent<HTMLAnchorElement>) => void;
} | null>(null);

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(currentLocation);
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    const restore = () => {
      const next = currentLocation();
      startTransition(() => setLocation(next));
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

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
    if (url.href === window.location.href) return;
    window.history.pushState(null, "", url);
    const next = currentLocation();
    startTransition(() => setLocation(next));
  };

  return (
    <NavigationContext value={{ search: location.search, pending, follow }}>
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
