import { useEffect, useState } from "react";
import { CLASSES } from "../shared/classes";
import { addDays, campusDate } from "../shared/dates";
import type { MailPage } from "../shared/models";
import type { ClassHighlight, Highlights } from "../shared/plans";
import { displayDate, href, useApi } from "./api";
import { Garden, Icon, RoomDoodle } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";

function DayCard({ highlight }: { highlight: ClassHighlight }) {
  const room = CLASSES.find((c) => c.id === highlight.classId);
  if (!room) return null;
  const day = highlight.day;
  return (
    <article className={`day-card ${room.color}`}>
      <div className="room-heading">
        <RoomDoodle kind={room.symbol} />
        <div>
          <span className="eyebrow">A peek into</span>
          <h3>{room.name}</h3>
        </div>
      </div>
      {day ? (
        <div className="day-content">
          <span className="small-label">
            {day.noSchool ? "NO SCHOOL" : "TODAY'S LITTLE ADVENTURE"}
          </span>
          <h4>{day.title}</h4>
          <p className="theme">{highlight.theme}</p>
          {day.activities.slice(0, 3).map((a) => (
            <p className="activity" key={`${a.area}-${a.description}`}>
              <strong>{a.area}</strong>
              {a.description}
            </p>
          ))}
          {(day.bring.length > 0 || day.reminders.length > 0) && (
            <div className="reminders">
              <span className="small-label">BEFORE YOU HEAD OUT</span>
              {day.bring.map((item) => (
                <p key={item}>
                  <Icon name="check" size={16} />
                  Bring: {item}
                </p>
              ))}
              {day.reminders.map((item) => (
                <p key={item}>
                  <Icon name="check" size={16} />
                  {item}
                </p>
              ))}
            </div>
          )}
          {day.note && <p className="day-note">{day.note}</p>}
        </div>
      ) : (
        <div className="day-content pending">
          <span className="small-label">
            {highlight.status === "awaiting-review"
              ? "PLAN AWAITING CONFIRMATION"
              : highlight.status === "no-day"
                ? "NO ENTRY FOR THIS DATE"
                : "A NEW PAGE IS WAITING"}
          </span>
          <h4>
            {highlight.status === "no-day"
              ? "A little space in the calendar."
              : "Good things are on their way."}
          </h4>
          <p>
            {highlight.status === "no-day"
              ? "The monthly plan doesn't list this day. Check classroom mail for updates."
              : highlight.status === "awaiting-review"
                ? "This month's plan is being checked. Classroom mail has the original details."
                : "Once the classroom's lesson plan is added, you'll find activities and things to remember right here."}
          </p>
          <span className="handwritten">a little more to discover soon ♡</span>
        </div>
      )}
      <a
        className="card-link"
        href={href({
          view: day ? "plans" : "mail",
          class: room.id,
          month: day?.date.slice(0, 7),
        })}
      >
        {day ? "See the month's plan" : "Visit classroom mail"}
        <Icon name="arrow" size={19} />
      </a>
    </article>
  );
}
export function Dashboard({
  selected,
  tomorrow,
}: {
  selected: string;
  tomorrow: boolean;
}) {
  const site = useApi<{ inboundAddress: string }>("/api/site");
  const [today, setToday] = useState(campusDate());
  useEffect(() => {
    const update = () => setToday(campusDate());
    const timer = setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  const date = tomorrow ? addDays(today, 1) : today;
  const daily = useApi<Highlights>(`/api/highlights?date=${date}`);
  const mail = useApi<MailPage>(
    `/api/mail?${new URLSearchParams({ class: selected })}`,
  );
  return (
    <>
      <section className="welcome">
        <div>
          <div className="eyebrow welcome-label">
            <span className="tiny-star">✳</span> THE FAMILY NOTEBOOK
          </div>
          <h1>
            Little days.
            <br />
            <span>Big discoveries.</span>
          </h1>
          <p>
            Classroom notes, little adventures, and the things
            <br className="desktop-break" /> to remember. All together, just for
            your family.
          </p>
          <span className="handwritten welcome-note">
            a little closer to their world <span>↗</span>
          </span>
        </div>
        <Garden />
      </section>
      <section className="daily-section" aria-labelledby="day-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">LET'S GET READY</span>
            <h2 id="day-heading">
              The day ahead <span className="sparkle">✧</span>
            </h2>
          </div>
          <div className="day-switch">
            <a
              href={href({ class: selected })}
              aria-current={!tomorrow ? "date" : undefined}
            >
              Today
            </a>
            <a
              href={href({ class: selected, day: "tomorrow" })}
              aria-current={tomorrow ? "date" : undefined}
            >
              Tomorrow
            </a>
          </div>
        </div>
        <div className="date-line">
          <Icon name="calendar" size={16} />
          <span>
            {displayDate(date, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </span>
          <span className="time-zone">· Monroe campus time</span>
        </div>
        <ClassFilters view="today" selected={selected} />
        {daily.data ? (
          <div className="day-grid">
            {daily.data.classes
              .filter((c) => selected === "all" || c.classId === selected)
              .map((c) => (
                <DayCard key={c.classId} highlight={c} />
              ))}
          </div>
        ) : (
          <LoadState error={daily.error} retry={daily.retry} />
        )}
      </section>
      <aside className="grownup-note">
        <span className="note-doodle">
          <Icon name="clip" size={27} />
        </span>
        <div>
          <h3>A note for the grown-ups</h3>
          <p>
            One little home for all three classrooms. Forward school updates to{" "}
            {site.data ? (
              <a href={`mailto:${site.data.inboundAddress}`}>
                {site.data.inboundAddress}
              </a>
            ) : (
              "your configured archive address"
            )}{" "}
            to keep the notebook growing.
          </p>
        </div>
        <span className="handwritten">
          less searching,
          <br />
          more being there.
        </span>
      </aside>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">FROM THE CLASSROOM</span>
            <h2>Fresh from the mailbox</h2>
          </div>
          <a
            className="text-link"
            href={href({ view: "mail", class: selected })}
          >
            All mail <Icon name="arrow" size={18} />
          </a>
        </div>
        {mail.data ? (
          mail.data.items.length ? (
            <div className="recent-list">
              {mail.data.items.slice(0, 3).map((item) => (
                <a
                  className="recent-item"
                  key={item.id}
                  href={href({ view: "mail", id: item.id, class: selected })}
                >
                  <span className="mail-symbol">
                    <Icon name="mail" />
                  </span>
                  <div>
                    <h3>{item.subject}</h3>
                    <p>
                      {item.sender_name || item.sender}{" "}
                      <span>· {displayDate(item.sent_at)}</span>
                    </p>
                    <div className="badges">
                      {item.class_ids.map((id) => (
                        <ClassBadge key={id} id={id} />
                      ))}
                    </div>
                  </div>
                  <Icon name="chevron" size={18} />
                </a>
              ))}
            </div>
          ) : (
            <Empty title="Your notebook is ready.">
              <p>
                The first classroom email will find a home here.
                <br />
                All the little details, easy to find again.
              </p>
            </Empty>
          )
        ) : (
          <LoadState error={mail.error} retry={mail.retry} />
        )}
      </section>
    </>
  );
}
