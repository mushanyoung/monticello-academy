import { useEffect, useState } from "react";
import { CLASSES } from "../shared/classes";
import { addDays, campusDate } from "../shared/dates";
import type { MailPage } from "../shared/models";
import type { ClassHighlight, Highlights } from "../shared/plans";
import { href, useApi } from "./api";
import { Garden, Icon, RoomDoodle } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";
import { useI18n } from "./i18n";
import { DayDetails } from "./lesson-details";

function DayCard({ highlight }: { highlight: ClassHighlight }) {
  const { t, className } = useI18n();
  const room = CLASSES.find((c) => c.id === highlight.classId);
  if (!room) return null;
  const day = highlight.day;
  return (
    <article className={`day-card ${room.color}`}>
      <div className="room-heading">
        <RoomDoodle kind={room.symbol} />
        <div>
          <span className="eyebrow">{t("A peek into")}</span>
          <h3>{className(room.id)}</h3>
        </div>
      </div>
      {day ? (
        <div className="day-content">
          <span className="small-label">
            {day.noSchool ? t("NO SCHOOL") : t("TODAY'S LITTLE ADVENTURE")}
          </span>
          <h4>{day.title}</h4>
          <p className="theme">{highlight.theme}</p>
          {day.activities.slice(0, 3).map((a) => (
            <p className="activity" key={`${a.area}-${a.description}`}>
              <strong>{a.area}</strong>
              {a.description}
            </p>
          ))}
          {day.activities.length > 3 && (
            <details className="day-note">
              <summary>
                {t("More activities ({count})", {
                  count: day.activities.length - 3,
                })}
              </summary>
              {day.activities.slice(3).map((activity) => (
                <p key={`${activity.area}-${activity.description}`}>
                  <strong>{activity.area}:</strong> {activity.description}
                </p>
              ))}
            </details>
          )}
          {!!highlight.weeklyFocus?.length && (
            <details className="day-note">
              <summary>{t("This week's focus")}</summary>
              {highlight.weeklyFocus.map((week) => (
                <div key={JSON.stringify(week)}>
                  <p>
                    <strong>{week.theme}</strong>
                  </p>
                  {week.focus.map((focus) => (
                    <p key={JSON.stringify(focus)}>
                      <strong>{focus.area}:</strong> {focus.items.join(" · ")}
                    </p>
                  ))}
                </div>
              ))}
            </details>
          )}
          {(day.bring.length > 0 || day.reminders.length > 0) && (
            <div className="reminders">
              <span className="small-label">{t("BEFORE YOU HEAD OUT")}</span>
              {day.bring.map((item) => (
                <p key={item}>
                  <Icon name="check" size={16} />
                  {t("Bring:")} {item}
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
          {!!highlight.monthlyReminders?.length && (
            <details className="day-note">
              <summary>{t("All-month reminders")}</summary>
              {highlight.monthlyReminders.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </details>
          )}
          {!!highlight.alternatives?.length && (
            <details className="day-note" open>
              <summary>{t("Also in the source documents")}</summary>
              {highlight.alternatives.map((entry) => (
                <DayDetails key={JSON.stringify(entry)} day={entry} />
              ))}
            </details>
          )}
          {!!highlight.sourceNotes?.length && (
            <details className="day-note">
              <summary>
                {t("Source notes ({count})", {
                  count: highlight.sourceNotes.length,
                })}
              </summary>
              {highlight.sourceNotes.map((note) => (
                <p key={note}>{note}</p>
              ))}
            </details>
          )}
        </div>
      ) : (
        <div className="day-content pending">
          <span className="small-label">
            {highlight.status === "no-day"
              ? t("NO ENTRY FOR THIS DATE")
              : t("A NEW PAGE IS WAITING")}
          </span>
          <h4>
            {highlight.status === "no-day"
              ? t("A little space in the calendar.")
              : t("Good things are on their way.")}
          </h4>
          <p>
            {highlight.status === "no-day"
              ? t(
                  "The monthly plan doesn't list this day. Check classroom mail for updates.",
                )
              : t(
                  "Once the classroom's lesson plan is added, you'll find activities and things to remember right here.",
                )}
          </p>
          <span className="handwritten">
            {t("a little more to discover soon ♡")}
          </span>
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
        {day ? t("See the month's plan") : t("Visit classroom mail")}
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
  const { t, displayDate } = useI18n();
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
            <span className="tiny-star">✳</span> {t("THE FAMILY NOTEBOOK")}
          </div>
          <h1>
            {t("Little days.")}
            <br />
            <span>{t("Big discoveries.")}</span>
          </h1>
          <p>
            {t("Classroom notes, little adventures, and the things")}
            <br className="desktop-break" />{" "}
            {t("to remember. All together, just for your family.")}
          </p>
          <span className="handwritten welcome-note">
            {t("a little closer to their world")} <span>↗</span>
          </span>
        </div>
        <Garden />
      </section>
      <section className="daily-section" aria-labelledby="day-heading">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("LET'S GET READY")}</span>
            <h2 id="day-heading">
              {t("The day ahead")} <span className="sparkle">✧</span>
            </h2>
          </div>
          <div className="day-switch">
            <a
              href={href({ class: selected })}
              aria-current={!tomorrow ? "date" : undefined}
            >
              {t("Today")}
            </a>
            <a
              href={href({ class: selected, day: "tomorrow" })}
              aria-current={tomorrow ? "date" : undefined}
            >
              {t("Tomorrow")}
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
          <span className="time-zone">{t("· Monroe campus time")}</span>
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
          <h3>{t("A note for the grown-ups")}</h3>
          <p>
            {t(
              "One little home for all three classrooms. Forward school updates to",
            )}{" "}
            {site.data ? (
              <a href={`mailto:${site.data.inboundAddress}`}>
                {site.data.inboundAddress}
              </a>
            ) : (
              t("your configured archive address")
            )}{" "}
            {t("to keep the notebook growing.")}
          </p>
        </div>
        <span className="handwritten">
          {t("less searching,")}
          <br />
          {t("more being there.")}
        </span>
      </aside>
      <section className="recent-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">{t("FROM THE CLASSROOM")}</span>
            <h2>{t("Fresh from the mailbox")}</h2>
          </div>
          <a
            className="text-link"
            href={href({ view: "mail", class: selected })}
          >
            {t("All mail")} <Icon name="arrow" size={18} />
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
            <Empty title={t("Your notebook is ready.")}>
              <p>
                {t("The first classroom email will find a home here.")}
                <br />
                {t("All the little details, easy to find again.")}
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
