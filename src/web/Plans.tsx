import { type ReactNode, useEffect, useState } from "react";
import { CLASSES } from "../shared/classes";
import { campusDate, startOfWeek, validDate } from "../shared/dates";
import type { StoredPlan } from "../shared/plans";
import { href, useApi } from "./api";
import { Icon, RoomDoodle } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";
import { useI18n } from "./i18n";
import { PlanDayBody } from "./lesson-details";
import { useNavigation } from "./navigation";
import { PlanSources, SourceNoteItems } from "./plan-sources";
import { TranslationNotice } from "./TranslationNotice";
import { monthForWeek, WeeklyPlans } from "./WeeklyPlans";

function PlanNotes({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="plan-notes">
      <summary className="small-label">{title}</summary>
      <ul>{children}</ul>
    </details>
  );
}

function defaultWeek(month: string, today: string) {
  return startOfWeek(today.startsWith(month) ? today : `${month}-01`);
}

export function Plans({
  selected,
  month,
  week,
}: {
  selected: string;
  month?: string;
  week?: string;
}) {
  const { t, displayDate } = useI18n();
  const { search, follow, navigate } = useNavigation();
  const [lastWeek, setLastWeek] = useState<string>();
  const available = useApi<{ months: string[] }>("/api/plan-months");
  const months = available.data?.months;
  const today = campusDate();
  const currentMonth = today.slice(0, 7);
  const requestedWeek = week && validDate(week) ? startOfWeek(week) : undefined;
  const weekMonth =
    requestedWeek && months
      ? monthForWeek(requestedWeek, months, month)
      : undefined;
  const selectedMonth =
    weekMonth ||
    (month && months?.includes(month)
      ? month
      : months?.includes(currentMonth)
        ? currentMonth
        : months?.[0]);
  const selectedWeek =
    week !== undefined && selectedMonth
      ? weekMonth
        ? requestedWeek
        : defaultWeek(selectedMonth, today)
      : undefined;
  useEffect(() => {
    if (
      selectedMonth &&
      (month !== selectedMonth || week !== selectedWeek) &&
      window.location.search === search
    )
      window.history.replaceState(
        window.history.state,
        "",
        href({
          view: "plans",
          class: selected,
          month: selectedMonth,
          week: selectedWeek,
        }),
      );
  }, [selectedMonth, month, selectedWeek, week, selected, search]);
  const planLink = (month: string, week?: string) =>
    href({ view: "plans", class: selected, month, week });
  return (
    <>
      <h1 className="sr-only">{t("Lesson plans")}</h1>
      <ClassFilters
        view="plans"
        selected={selected}
        month={selectedMonth || month}
        week={selectedWeek}
      />
      {!months ? (
        <LoadState error={available.error} retry={available.retry} />
      ) : selectedMonth ? (
        <>
          <div className="plan-toolbar">
            <div className="month-picker">
              <label htmlFor="month">{t("Month")}</label>
              <select
                id="month"
                name="month"
                value={selectedMonth}
                onChange={(event) => {
                  const target = event.currentTarget.value;
                  navigate(
                    planLink(
                      target,
                      selectedWeek ? defaultWeek(target, today) : undefined,
                    ),
                  );
                }}
              >
                {months.map((value) => (
                  <option key={value} value={value}>
                    {displayDate(`${value}-01`, {
                      year: "numeric",
                      month: "long",
                    })}
                  </option>
                ))}
              </select>
            </div>
            <nav
              className="plan-view-switch"
              aria-label={t("Lesson plan view")}
            >
              <a
                href={planLink(selectedMonth)}
                onClick={(event) => {
                  if (selectedWeek) setLastWeek(selectedWeek);
                  follow(event);
                }}
                aria-current={!selectedWeek ? "page" : undefined}
              >
                <Icon name="calendar" size={17} />
                {t("Month view")}
              </a>
              <a
                href={planLink(
                  selectedMonth,
                  selectedWeek ||
                    (lastWeek &&
                    monthForWeek(lastWeek, months, selectedMonth) ===
                      selectedMonth
                      ? lastWeek
                      : defaultWeek(selectedMonth, today)),
                )}
                onClick={follow}
                aria-current={selectedWeek ? "page" : undefined}
              >
                <Icon name="book" size={17} />
                {t("Week view")}
              </a>
            </nav>
          </div>
          {selectedWeek ? (
            <WeeklyPlans
              selected={selected}
              month={selectedMonth}
              week={selectedWeek}
              months={months}
              today={today}
            />
          ) : (
            <MonthlyPlans
              key={`${selected}:${selectedMonth}`}
              selected={selected}
              selectedMonth={selectedMonth}
            />
          )}
        </>
      ) : (
        <Empty
          title={t("No lesson plans have been added yet.")}
          icon="calendar"
        >
          <a className="button" href={href({ view: "mail", class: selected })}>
            {t("Explore classroom mail")} <Icon name="arrow" size={18} />
          </a>
        </Empty>
      )}
    </>
  );
}
function MonthlyPlans({
  selected,
  selectedMonth,
}: {
  selected: string;
  selectedMonth: string;
}) {
  const { t, displayDate } = useI18n();
  const plans = useApi<{ items: StoredPlan[] }>(
    `/api/plans?${new URLSearchParams({ class: selected, month: selectedMonth })}`,
  );
  return (
    <>
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
                  <TranslationNotice status={plan.translationStatus} />
                  {plan.sourceKind === "carryover" && (
                    <p className="bring-note">
                      {t(
                        "Partial month · These dates appear in an adjacent month's PDF.",
                      )}
                    </p>
                  )}
                  {!!plan.monthlyReminders?.length && (
                    <PlanNotes title={t("ALL MONTH LONG")}>
                      {plan.monthlyReminders.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </PlanNotes>
                  )}
                  {!!plan.sourceNotes?.length && (
                    <PlanNotes title={t("NOTES FROM THE ORIGINAL SOURCES")}>
                      <SourceNoteItems notes={plan.sourceNotes} />
                    </PlanNotes>
                  )}
                  {plan.objectives.length > 0 && (
                    <PlanNotes title={t("LITTLE STEPS WE'RE WORKING ON")}>
                      {plan.objectives.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </PlanNotes>
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
                          <PlanDayBody
                            day={day}
                            alternatives={plan.alternateDays?.filter(
                              (entry) => entry.date === day.date,
                            )}
                          />
                        </details>
                      ))}
                  </div>
                  <PlanSources plan={plan} />
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
