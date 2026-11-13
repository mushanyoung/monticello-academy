import { CLASSES } from "../shared/classes";
import { campusDate } from "../shared/dates";
import type { StoredPlan } from "../shared/plans";
import { href, useApi } from "./api";
import { Icon, RoomDoodle } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";
import { useI18n } from "./i18n";
import { DayDetails } from "./lesson-details";
export function Plans({
  selected,
  month,
}: {
  selected: string;
  month?: string;
}) {
  const { t, displayDate } = useI18n();
  const selectedMonth = month || campusDate().slice(0, 7);
  const plans = useApi<{ items: StoredPlan[] }>(
    `/api/plans?${new URLSearchParams({ class: selected, month: selectedMonth })}`,
  );
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">{t("ROOM TO GROW")}</span>
        <h1>
          {t("A month of")}
          <br />
          <span>{t("little possibilities.")}</span>
        </h1>
        <p>
          {t(
            "Themes, activities, and things to remember, one month at a time.",
          )}
        </p>
        <span className="heading-doodle">
          <Icon name="calendar" size={85} />
        </span>
      </header>
      <div className="plans-toolbar">
        <ClassFilters view="plans" selected={selected} month={selectedMonth} />
        <form action="/" method="get" className="month-form">
          <input type="hidden" name="view" value="plans" />
          <input type="hidden" name="class" value={selected} />
          <label htmlFor="month">{t("Month")}</label>
          <input
            id="month"
            name="month"
            type="month"
            defaultValue={selectedMonth}
            required
          />
          <button className="button" type="submit">
            {t("Go")} <Icon name="arrow" size={16} />
          </button>
        </form>
      </div>
      {plans.data ? (
        plans.data.items.length ? (
          <div className="plan-list">
            {plans.data.items.map((plan) => {
              const room = CLASSES.find((c) => c.id === plan.classId);
              return (
                <article className="plan" key={plan.id}>
                  <div className="plan-heading">
                    <div>
                      <ClassBadge id={plan.classId} />
                      <h2>{plan.title}</h2>
                      <p className="plan-month">
                        {displayDate(`${plan.month}-01`, {
                          month: "long",
                          year: "numeric",
                        })}{" "}
                        · {plan.theme}
                      </p>
                    </div>
                    <RoomDoodle kind={room?.symbol || "sun"} size={85} />
                  </div>
                  <p className="plan-overview">{plan.overview}</p>
                  {plan.sourceKind === "carryover" && (
                    <p className="bring-note">
                      {t(
                        "Partial month · These dates appear in an adjacent month's PDF.",
                      )}
                    </p>
                  )}
                  {!!plan.monthlyReminders?.length && (
                    <div className="objectives">
                      <span className="small-label">{t("ALL MONTH LONG")}</span>
                      <ul>
                        {plan.monthlyReminders.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {!!plan.sourceNotes?.length && (
                    <div className="objectives">
                      <span className="small-label">
                        {t("NOTES FROM THE ORIGINAL SOURCES")}
                      </span>
                      <ul>
                        {plan.sourceNotes.map((note) => (
                          <li key={JSON.stringify(note)}>
                            {note.description}{" "}
                            <a
                              className="text-link"
                              href={`/api/attachments/${note.attachmentId}?preview=1#page=${note.pages[0] || 1}`}
                            >
                              {note.pages.length
                                ? t("PDF · p. {pages}", {
                                    pages: note.pages.join(", "),
                                  })
                                : t("PDF")}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {plan.objectives.length > 0 && (
                    <div className="objectives">
                      <span className="small-label">
                        {t("LITTLE STEPS WE'RE WORKING ON")}
                      </span>
                      <ul>
                        {plan.objectives.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="plan-days">
                    {plan.weeks?.map((week) => (
                      <details className="plan-day" key={JSON.stringify(week)}>
                        <summary>
                          <span>
                            <strong>{week.theme}</strong>
                            <span>
                              {displayDate(week.startDate)} –{" "}
                              {displayDate(week.endDate)}
                            </span>
                          </span>
                          <Icon name="chevron" size={18} />
                        </summary>
                        <div className="plan-day-body">
                          {week.focus.map((focus) => (
                            <p key={focus.area}>
                              <strong>{focus.area}:</strong>{" "}
                              {focus.items.join(" · ")}
                            </p>
                          ))}
                        </div>
                      </details>
                    ))}
                    {[...plan.days]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((day) => (
                        <details
                          className="plan-day"
                          key={day.date}
                          open={day.date === campusDate()}
                        >
                          <summary>
                            <span className="day-date">
                              <strong>{day.date.slice(-2)}</strong>
                              {displayDate(day.date, { weekday: "short" })}
                            </span>
                            <span>
                              <strong>{day.title}</strong>
                              <span>
                                {day.noSchool
                                  ? t("No school")
                                  : t("{count} activities", {
                                      count: day.activities.length,
                                    })}
                                {day.bring.length + day.reminders.length > 0
                                  ? t(" · Things to remember")
                                  : ""}
                              </span>
                            </span>
                            <Icon name="chevron" size={18} />
                          </summary>
                          <div className="plan-day-body">
                            {day.activities.map((a) => (
                              <p key={`${a.area}-${a.description}`}>
                                <strong>{a.area}</strong> — {a.description}
                              </p>
                            ))}
                            {day.bring.length > 0 && (
                              <p className="bring-note">
                                <strong>{t("Bring along:")}</strong>{" "}
                                {day.bring.join(" · ")}
                              </p>
                            )}
                            {day.reminders.map((r) => (
                              <p key={r}>
                                <strong>{t("Remember:")}</strong> {r}
                              </p>
                            ))}
                            {day.note && <p>{day.note}</p>}
                            {day.sourceAttachmentId && (
                              <a
                                className="text-link"
                                href={`/api/attachments/${day.sourceAttachmentId}?preview=1#page=${day.sourcePages?.[0] || 1}`}
                              >
                                {t("Source PDF · p.")}{" "}
                                {day.sourcePages?.join(", ") || "1"}
                              </a>
                            )}
                            {plan.alternateDays
                              ?.filter((entry) => entry.date === day.date)
                              .map((entry) => (
                                <div
                                  className="objectives"
                                  key={JSON.stringify(entry)}
                                >
                                  <span className="small-label">
                                    {t("ALSO IN THE SOURCE DOCUMENTS")}
                                  </span>
                                  <DayDetails day={entry} />
                                </div>
                              ))}
                          </div>
                        </details>
                      ))}
                  </div>
                  <div className="plan-source">
                    {plan.sources?.map((source) => (
                      <a
                        className="text-link"
                        key={source.attachmentId}
                        href={`/api/attachments/${source.attachmentId}?preview=1`}
                      >
                        {source.filename}
                      </a>
                    ))}
                    <a
                      className="text-link"
                      href={href({
                        view: "mail",
                        id: plan.sourceMessageId,
                        class: plan.classId,
                      })}
                    >
                      {t("Read the source email")}{" "}
                      <Icon name="arrow" size={18} />
                    </a>
                    <span>
                      {t("Updated")} {displayDate(plan.updatedAt)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty title={t("This month is still taking shape.")} icon="calendar">
            <p>
              {t("No lesson plans for {month} yet.", {
                month: displayDate(`${selectedMonth}-01`, {
                  month: "long",
                  year: "numeric",
                }),
              })}
              <br />
              {t("Classroom emails and attachments have the original details.")}
            </p>
            <a
              className="button"
              href={href({ view: "mail", class: selected })}
            >
              {t("Explore classroom mail")} <Icon name="arrow" size={18} />
            </a>
          </Empty>
        )
      ) : (
        <LoadState error={plans.error} retry={plans.retry} />
      )}
    </>
  );
}
