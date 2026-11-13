import type { ReactNode } from "react";
import { CLASSES, type ClassId } from "../shared/classes";
import { href } from "./api";
import { Icon } from "./art";
export function ClassBadge({ id }: { id: ClassId }) {
  const room = CLASSES.find((c) => c.id === id);
  return room ? (
    <span className={`badge ${room.color}`}>
      <span className="dot" />
      {room.name}
    </span>
  ) : null;
}
export function ClassFilters({
  view,
  selected,
  month,
}: {
  view: string;
  selected: string;
  month?: string;
}) {
  const current = new URLSearchParams(window.location.search);
  const context = {
    q: view === "mail" ? current.get("q") || undefined : undefined,
    sort: view === "mail" ? current.get("sort") || undefined : undefined,
    day: view === "today" ? current.get("day") || undefined : undefined,
  };
  return (
    <nav className="class-filters" aria-label="Filter by classroom">
      <a
        className={selected === "all" ? "selected" : ""}
        href={href({ ...context, view, month })}
        aria-current={selected === "all" ? "true" : undefined}
      >
        All classrooms
      </a>
      {CLASSES.map((c) => (
        <a
          key={c.id}
          className={selected === c.id ? "selected" : ""}
          href={href({ ...context, view, class: c.id, month })}
          aria-current={selected === c.id ? "true" : undefined}
        >
          <span className={`dot ${c.color}`} />
          {c.name}
        </a>
      ))}
    </nav>
  );
}
export function LoadState({
  error,
  retry,
}: {
  error: string | null;
  retry: () => void;
}) {
  return (
    <div className="load-state" role={error ? "alert" : "status"}>
      {error ? (
        <>
          <p>{error}</p>
          <button type="button" className="button" onClick={retry}>
            Try again <Icon name="arrow" size={16} />
          </button>
        </>
      ) : (
        <>
          <span className="loading-dot" />
          <p>Opening your notebook…</p>
        </>
      )}
    </div>
  );
}
export function Empty({
  title,
  children,
  icon = "mail",
}: {
  title: string;
  children: ReactNode;
  icon?: "mail" | "calendar";
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={30} />
      </span>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}
