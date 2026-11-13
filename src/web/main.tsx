import { createRoot } from "react-dom/client";
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
import { displayDate, href, useApi } from "./api";
import { Icon, RoomDoodle } from "./art";
import { Dashboard } from "./Dashboard";
import { Mailbox } from "./Mailbox";
import { Plans } from "./Plans";

function App() {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") || "today";
  const c = params.get("class") || "all";
  const selected = isClassId(c) ? c : "all";
  const stats = useApi<{ total: number }>("/api/stats");
  const links = [
    { view: "today", name: "The day ahead", icon: "sun" },
    { view: "mail", name: "Mailbox", icon: "mail" },
    { view: "plans", name: "Lesson plans", icon: "calendar" },
  ] as const;
  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="sidebar">
        <a className="brand" href="/">
          <span className="brand-mark">
            <RoomDoodle kind="sun" size={53} />
          </span>
          <span>
            monticello<span className="brand-sub">the family notebook</span>
          </span>
        </a>
        <div className="campus-label">
          <span className="dot green" /> MONROE CAMPUS
        </div>
        <nav className="main-nav" aria-label="Main navigation">
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
        <div className="sidebar-rooms">
          <span className="eyebrow">OUR LITTLE CLASSROOMS</span>
          {CLASSES.map((room) => (
            <a key={room.id} href={href({ view: "mail", class: room.id })}>
              <span className={`dot ${room.color}`} />
              {room.name}
              <Icon name="chevron" size={13} />
            </a>
          ))}
        </div>
        <div className="sidebar-bottom">
          <div className="sidebar-flower">✳</div>
          <p>
            Small moments.
            <br />
            Wonderful beginnings.
          </p>
          <span className="handwritten">let's grow together.</span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span>
            Monticello Academy <span className="topbar-divider">/</span>{" "}
            <strong>Monroe campus</strong>
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
          <span>MADE FOR THE LITTLE THINGS THAT MATTER.</span>
          <span>
            Monroe campus <span>♡</span> Monticello families
          </span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {links.map((link) => (
          <a
            key={link.view}
            href={href({ view: link.view, class: selected })}
            aria-current={view === link.view ? "page" : undefined}
          >
            <Icon name={link.icon} />
            <span>{link.view === "today" ? "Today" : link.name}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
const root = document.getElementById("root");
if (!root) throw new Error("Missing application root");
createRoot(root).render(<App />);
