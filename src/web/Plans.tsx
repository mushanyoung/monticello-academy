import { type ReactNode, useEffect, useState } from "react";
import { CLASSES, isClassId } from "../shared/classes";
import {
  addDays,
  endOfSchoolWeek,
  isWeekday,
  startOfWeek,
  validDate,
  weekdayOnOrAfter,
  weekdayRanges,
} from "../shared/dates";
import type { StoredPlan } from "../shared/plans";
import { href, useApi } from "./api";
import { Icon, RoomDoodle } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";
import { useI18n } from "./i18n";
import { PlanDayBody } from "./lesson-details";
import { useNavigation } from "./navigation";
import { PlanSources, SourceNoteItems } from "./plan-sources";
import { TranslationNotice } from "./TranslationNotice";
import { WeeklyPlans } from "./WeeklyPlans";

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
  const firstWeekday = weekdayOnOrAfter(`${month}-01`);
  return startOfWeek(
    today.startsWith(month) && today >= firstWeekday ? today : firstWeekday,
  );
}

function monthForWeek(week: string, months: string[], preferred?: string) {
  if (!validDate(week)) return undefined;
  const first = week.slice(0, 7);
  const last = endOfSchoolWeek(week).slice(0, 7);
  if (
    preferred &&
    (preferred === first || preferred === last) &&
    months.includes(preferred)
  )
    return preferred;
  return [first, last].find((month) => months.includes(month));
}

function planSelection(
  search: string,
  months: string[] | undefined,
  today: string,
) {
  const params = new URLSearchParams(search);
  const month = params.get("month") || undefined;
  const week = params.get("week") ?? undefined;
  const room = params.get("class") || "all";
  const selected = isClassId(room) ? room : "all";
  if (!months?.length) return { selected, month, week };
  const currentMonth = today.slice(0, 7);
  const requestedWeek = week && validDate(week) ? startOfWeek(week) : undefined;
  const weekMonth = requestedWeek
    ? monthForWeek(requestedWeek, months, month)
    : undefined;
  const selectedMonth =
    weekMonth ||
    (month && months.includes(month)
      ? month
      : months.includes(currentMonth)
        ? currentMonth
        : months[0]);
  const selectedWeek =
    week !== undefined && selectedMonth
      ? weekMonth
        ? requestedWeek
        : defaultWeek(selectedMonth, today)
      : undefined;
  return {
    selected,
    month: selectedMonth,
    week: selectedWeek,
  };
}

export function Plans({ today }: { today: string }) {
  const { t, displayDate } = useI18n();
  const { search, requestedSearch, follow, navigate, replaceSearch } =
    useNavigation();
  const [lastWeek, setLastWeek] = useState<string>();
  const available = useApi<{ months: string[] }>("/api/plan-months");
  const months = available.data?.months;
  const visible = planSelection(search, months, today);
  const target =
    search === requestedSearch
      ? visible
      : planSelection(requestedSearch, months, today);
  const { selected, month: selectedMonth, week: selectedWeek } = visible;
  useEffect(() => {
    const params = new URLSearchParams(search);
    if (
      selectedMonth &&
      (params.get("month") !== selectedMonth ||
        (params.get("week") ?? undefined) !== selectedWeek) &&
      window.location.search === search
    )
      replaceSearch(
        href({
          view: "plans",
          class: selected,
          month: selectedMonth,
          week: selectedWeek,
        }),
      );
  }, [selectedMonth, selectedWeek, selected, search, replaceSearch]);
  const planLink = (month: string, week?: string) =>
    href({ view: "plans", class: target.selected, month, week });
  function weekLink(date: string, preferred = target.month) {
    const month = monthForWeek(date, months || [], preferred);
    return month && planLink(month, date);
  }
  return (
    <>
      <h1 className="sr-only">{t("Lesson plans")}</h1>
      <ClassFilters
        view="plans"
        selected={selected}
        month={target.month}
        week={target.week}
      />
      {!months ? (
        <LoadState error={available.error} retry={available.retry} />
      ) : months.length && selectedMonth && target.month ? (
        <>
          <div className="plan-toolbar">
            <div className="month-picker">
              <label htmlFor="month">{t("Month")}</label>
              <select
                id="month"
                name="month"
                value={target.month}
                onChange={(event) => {
                  const month = event.currentTarget.value;
                  navigate(
                    planLink(
                      month,
                      target.week ? defaultWeek(month, today) : undefined,
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
                href={planLink(target.month)}
                onClick={(event) => {
                  if (target.week) setLastWeek(target.week);
                  follow(event);
                }}
                aria-current={!selectedWeek ? "page" : undefined}
              >
                <Icon name="calendar" size={17} />
                {t("Month view")}
              </a>
              <a
                href={planLink(
                  target.month,
                  target.week ||
                    (lastWeek &&
                    monthForWeek(lastWeek, months, target.month) ===
                      target.month
                      ? lastWeek
                      : defaultWeek(target.month, today)),
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
              week={selectedWeek}
              today={today}
              previous={weekLink(addDays(target.week || selectedWeek, -7))}
              next={weekLink(addDays(target.week || selectedWeek, 7))}
              current={weekLink(startOfWeek(today), today.slice(0, 7))}
            />
          ) : (
            <MonthlyPlans
              key={`${selected}:${selectedMonth}`}
              selected={selected}
              selectedMonth={selectedMonth}
              today={today}
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
  today,
}: {
  selected: string;
  selectedMonth: string;
  today: string;
}) {
  const { t, displayDate, displayDateRange } = useI18n();
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
              const weeks = new Map(
                weekdayRanges(plan.weeks || []).map((week) => [
                  JSON.stringify(week),
                  week,
                ]),
              );
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
                    {[...weeks].map(([key, week]) => (
                      <details className="plan-day" key={key}>
                        <summary>
                          <span>
                            <strong>{week.theme}</strong>
                            <span>
                              {displayDateRange(week.startDate, week.endDate)}
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
                    {plan.days
                      .filter((day) => isWeekday(day.date))
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((day) => (
                        <details
                          className="plan-day"
                          key={day.date}
                          open={day.date === today}
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
