import { CLASSES } from "../shared/classes";
import { campusDate } from "../shared/dates";
import type { StoredPlan } from "../shared/plans";
import { displayDate, href, useApi } from "./api";
import { Icon, RoomDoodle } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";
export function Plans({
  selected,
  month,
}: {
  selected: string;
  month?: string;
}) {
  const selectedMonth = month || campusDate().slice(0, 7);
  const plans = useApi<{ items: StoredPlan[] }>(
    `/api/plans?${new URLSearchParams({ class: selected, month: selectedMonth })}`,
  );
  return (
    <>
      <header className="page-heading">
        <span className="eyebrow">ROOM TO GROW</span>
        <h1>
          A month of
          <br />
          <span>little possibilities.</span>
        </h1>
        <p>Themes, activities, and things to remember, one month at a time.</p>
        <span className="heading-doodle">
          <Icon name="calendar" size={85} />
        </span>
      </header>
      <div className="plans-toolbar">
        <ClassFilters view="plans" selected={selected} month={selectedMonth} />
        <form action="/" method="get" className="month-form">
          <input type="hidden" name="view" value="plans" />
          <input type="hidden" name="class" value={selected} />
          <label htmlFor="month">Month</label>
          <input
            id="month"
            name="month"
            type="month"
            defaultValue={selectedMonth}
            required
          />
          <button className="button" type="submit">
            Go <Icon name="arrow" size={16} />
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
                  {plan.objectives.length > 0 && (
                    <div className="objectives">
                      <span className="small-label">
                        LITTLE STEPS WE'RE WORKING ON
                      </span>
                      <ul>
                        {plan.objectives.map((o) => (
                          <li key={o}>{o}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="plan-days">
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
                                  ? "No school"
                                  : `${day.activities.length} activities`}
                                {day.bring.length + day.reminders.length > 0
                                  ? " · Things to remember"
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
                                <strong>Bring along:</strong>{" "}
                                {day.bring.join(" · ")}
                              </p>
                            )}
                            {day.reminders.map((r) => (
                              <p key={r}>
                                <strong>Remember:</strong> {r}
                              </p>
                            ))}
                            {day.note && <p>{day.note}</p>}
                          </div>
                        </details>
                      ))}
                  </div>
                  <div className="plan-source">
                    <a
                      className="text-link"
                      href={href({
                        view: "mail",
                        id: plan.sourceMessageId,
                        class: plan.classId,
                      })}
                    >
                      Read the source email <Icon name="arrow" size={18} />
                    </a>
                    <span>Updated {displayDate(plan.updatedAt)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty title="This month is still taking shape." icon="calendar">
            <p>
              No confirmed lesson plans for{" "}
              {displayDate(`${selectedMonth}-01`, {
                month: "long",
                year: "numeric",
              })}{" "}
              yet.
              <br />
              Classroom emails and attachments have the original details.
            </p>
            <a
              className="button"
              href={href({ view: "mail", class: selected })}
            >
              Explore classroom mail <Icon name="arrow" size={18} />
            </a>
          </Empty>
        )
      ) : (
        <LoadState error={plans.error} retry={plans.retry} />
      )}
    </>
  );
}
