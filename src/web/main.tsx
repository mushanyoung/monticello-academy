import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { useI18n } from "./i18n";
import { LanguageProvider, LanguageSwitch } from "./language";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import "@fontsource/fraunces/latin-500.css";
import "@fontsource/fraunces/latin-600.css";
import "@fontsource/caveat/latin-500.css";
import "./styles.css";
import { CLASSES, isClassId } from "../shared/classes";
import { campusDate } from "../shared/dates";
import { href, useApi } from "./api";
import { Icon, RoomDoodle } from "./art";
import { Dashboard } from "./Dashboard";
import { Mailbox } from "./Mailbox";
import { Plans } from "./Plans";

function App() {
  const { t, displayDate, className } = useI18n();
  useEffect(() => {
    document.title = `Monticello · ${t("Monroe campus")}`;
  }, [t]);
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") || "today";
  const c = params.get("class") || "all";
  const selected = isClassId(c) ? c : "all";
  const stats = useApi<{ total: number }>("/api/stats");
  const links = [
    { view: "today", name: t("The day ahead"), icon: "sun" },
    { view: "mail", name: t("Mailbox"), icon: "mail" },
    { view: "plans", name: t("Lesson plans"), icon: "calendar" },
  ] as const;
  return (
    <div className="app">
      <LanguageSwitch />
      <a className="skip-link" href="#main">
        {t("Skip to content")}
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-name">{t("monticello")}</span>
          <span className="brand-classrooms">
            {CLASSES.map((room) => (
              <span
                key={room.id}
                role="img"
                aria-label={className(room.id)}
                title={className(room.id)}
              >
                <RoomDoodle kind={room.symbol} size={36} />
              </span>
            ))}
          </span>
        </a>
        <div className="campus-label">
          <span className="dot green" /> {t("MONROE CAMPUS")}
        </div>
        <nav className="main-nav" aria-label={t("Main navigation")}>
          {links.map((link) => (
            <a
              key={link.view}
              href={href({ view: link.view, class: selected })}
              aria-current={view === link.view ? "page" : undefined}
            >
              <Icon name={link.icon} />
              <span>{link.name}</span>
              {link.view === "mail" && stats.data && (
                <span className="nav-count">{stats.data.total}</span>
              )}
            </a>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-flower">✳</div>
          <p>
            {t("Small moments.")}
            <br />
            {t("Wonderful beginnings.")}
          </p>
          <span className="handwritten">{t("let's grow together.")}</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            {t("Monticello Academy")} <span className="topbar-divider">/</span>{" "}
            <strong>{t("Monroe campus")}</strong>
          </span>
          <span className="topbar-date">
            <span className="dot" />
            {displayDate(campusDate(), {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        </header>
        <main id="main">
          {view === "mail" ? (
            <Mailbox selected={selected} params={params} />
          ) : view === "plans" ? (
            <Plans
              selected={selected}
              month={params.get("month") || undefined}
            />
          ) : (
            <Dashboard
              selected={selected}
              tomorrow={params.get("day") === "tomorrow"}
            />
          )}
        </main>
        <footer className="footer">
          <span>{t("MADE FOR THE LITTLE THINGS THAT MATTER.")}</span>
          <span>
            {t("Monroe campus")} <span>♡</span> {t("Monticello families")}
          </span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label={t("Mobile navigation")}>
        {links.map((link) => (
          <a
            key={link.view}
            href={href({ view: link.view, class: selected })}
            aria-current={view === link.view ? "page" : undefined}
          >
            <Icon name={link.icon} />
            <span>{link.view === "today" ? t("Today") : link.name}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(
  <LanguageProvider>
    <App />
  </LanguageProvider>,
);
