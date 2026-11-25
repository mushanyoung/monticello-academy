import { useId, useState } from "react";
import { CLASSES, type ClassId } from "../shared/classes";
import {
  addDays,
  endOfSchoolWeek,
  SCHOOL_DAYS_PER_WEEK,
  startOfWeek,
} from "../shared/dates";
import type { LessonDay, StoredPlan } from "../shared/plans";
import { href, useApi } from "./api";
import { Icon } from "./art";
import { ClassBadge, Empty, LoadState } from "./components";
import { useI18n } from "./i18n";
import { PlanDayBody } from "./lesson-details";
import { useNavigation } from "./navigation";
import { PlanSources, SourceNoteItems } from "./plan-sources";
import { TranslationNotice } from "./TranslationNotice";

interface ClassroomWeek {
  id: ClassId;
  plans: StoredPlan[];
}

function WeekEntry({
  day,
  alternatives,
  classroom,
  all,
  today,
}: {
  day: LessonDay;
  alternatives: LessonDay[];
  classroom: ClassId;
  all: boolean;
  today: boolean;
}) {
  const { t } = useI18n();
  const bodyId = useId();
  const [userExpanded, setUserExpanded] = useState<boolean>();
  const expanded = userExpanded ?? (today && !all);
  const preview = day.bring[0]
    ? `${t("Bring:")} ${day.bring[0]}`
    : day.reminders[0];
  return (
    <article
      className="week-entry"
      data-classroom={classroom}
      data-expanded={expanded}
    >
      <header className="week-entry-heading">
        {(all || day.noSchool || alternatives.length > 0) && (
          <span className="week-entry-labels">
            {all && <ClassBadge id={classroom} />}
            {day.noSchool && (
              <span className="week-closure">{t("No school")}</span>
            )}
            {alternatives.length > 0 && (
              <span className="week-other-source">
                {t("Additional source entry")}
              </span>
            )}
          </span>
        )}
        <h5 className="week-entry-title">
          <span>{day.title}</span>
          <button
            type="button"
            aria-controls={bodyId}
            aria-expanded={expanded}
            onClick={() => setUserExpanded(!expanded)}
          >
            {day.title}
            <Icon name="chevron" size={17} />
          </button>
        </h5>
        {preview && (
          <span className="week-preview">
            <Icon name="check" size={15} />
            <span>{preview}</span>
          </span>
        )}
      </header>
      <PlanDayBody id={bodyId} day={day} alternatives={alternatives} />
    </article>
  );
}

function WeekAgenda({
  week,
  today,
  groups,
  all,
}: {
  week: string;
  today: string;
  groups: ClassroomWeek[];
  all: boolean;
}) {
  const { t, displayDate } = useI18n();
  return (
    <section className="week-agenda" aria-labelledby="week-agenda-title">
      <div className="week-section-heading">
        <h3 id="week-agenda-title">{t("Daily schedule")}</h3>
        <a className="week-focus-jump" href="#week-focus">
          {t("This week's focus")} <Icon name="arrow" size={14} />
        </a>
      </div>
      <ol className="week-days">
        {Array.from({ length: SCHOOL_DAYS_PER_WEEK }, (_, index) => {
          const date = addDays(week, index);
          const entries = groups.flatMap(({ id, plans }) => {
            const primary = plans
              .flatMap((p) => p.days)
              .find((d) => d.date === date);
            const alternatives = plans
              .flatMap((p) => p.alternateDays || [])
              .filter((d) => d.date === date);
            const day = primary ?? alternatives.shift();
            return day
              ? [
                  <WeekEntry
                    key={id}
                    day={day}
                    alternatives={alternatives}
                    classroom={id}
                    all={all}
                    today={today === date}
                  />,
                ]
              : [];
          });
          return (
            <li
              key={date}
              className="week-day"
              aria-current={today === date ? "date" : undefined}
            >
              <h4 className="week-date">
                <time dateTime={date}>
                  <span className="sr-only">
                    {displayDate(date, { dateStyle: "full" })}
                  </span>
                  <span aria-hidden="true">
                    {displayDate(date, { weekday: "short" })}
                  </span>
                  <strong aria-hidden="true">{Number(date.slice(-2))}</strong>
                </time>
                {today === date && (
                  <span className="week-today">{t("Today")}</span>
                )}
              </h4>
              <div className="week-entries">
                {entries.length ? (
                  entries
                ) : (
                  <p className="week-unlisted">{t("No entry listed")}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function WeekFocus({ groups }: { groups: ClassroomWeek[] }) {
  const { t, displayDate, displayDateRange } = useI18n();
  const { follow } = useNavigation();
  return (
    <aside
      className="week-focus"
      id="week-focus"
      tabIndex={-1}
      aria-labelledby="week-focus-title"
    >
      <div className="week-focus-heading">
        <Icon name="book" size={22} />
        <h3 id="week-focus-title">{t("This week's focus")}</h3>
      </div>
      {groups.map(({ id, plans }) => {
        const weeks = new Map(
          plans
            .flatMap((p) => p.weeks || [])
            .map((w) => [JSON.stringify(w), w]),
        );
        return (
          <section key={id} className="week-class-focus">
            <h4>
              <ClassBadge id={id} />
            </h4>
            {plans
              .filter(
                (p) => p.translationStatus && p.translationStatus !== "ready",
              )
              .map((plan) => (
                <div key={plan.id}>
                  {plans.length > 1 && (
                    <strong>
                      {displayDate(`${plan.month}-01`, {
                        month: "long",
                        year: "numeric",
                      })}
                    </strong>
                  )}
                  <TranslationNotice status={plan.translationStatus} />
                </div>
              ))}
            {weeks.size ? (
              [...weeks].map(([key, w]) => (
                <details className="week-theme" key={key}>
                  <summary>
                    <span>
                      <strong>{w.theme}</strong>
                      <small>{displayDateRange(w.startDate, w.endDate)}</small>
                    </span>
                    <Icon name="chevron" size={16} />
                  </summary>
                  {w.focus.length ? (
                    <dl>
                      {w.focus.map((f) => (
                        <div key={JSON.stringify(f)}>
                          <dt>{f.area}</dt>
                          <dd>{f.items.join(" · ")}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p>{t("No weekly goals listed.")}</p>
                  )}
                </details>
              ))
            ) : (
              <p className="week-no-focus">{t("No weekly goals listed.")}</p>
            )}
            <details className="week-references">
              <summary>
                {t("Monthly reminders and sources")}{" "}
                <Icon name="chevron" size={15} />
              </summary>
              {plans.map((plan) => (
                <div className="week-month-source" key={plan.id}>
                  <a
                    className="text-link"
                    onClick={follow}
                    href={href({ view: "plans", class: id, month: plan.month })}
                  >
                    {displayDate(`${plan.month}-01`, {
                      month: "long",
                      year: "numeric",
                    })}{" "}
                    <Icon name="arrow" size={15} />
                  </a>
                  {plan.sourceKind === "carryover" && (
                    <p className="bring-note">
                      {t(
                        "Partial month · These dates appear in an adjacent month's PDF.",
                      )}
                    </p>
                  )}
                  {!!plan.monthlyReminders?.length && (
                    <ul>
                      {plan.monthlyReminders.map((r) => (
                        <li key={r}>{r}</li>
                      ))}
                    </ul>
                  )}
                  {!!plan.sourceNotes?.length && (
                    <ul>
                      <SourceNoteItems notes={plan.sourceNotes} />
                    </ul>
                  )}
                  <PlanSources plan={plan} />
                </div>
              ))}
            </details>
          </section>
        );
      })}
    </aside>
  );
}

export function WeeklyPlans({
  selected,
  week,
  today,
  previous,
  next,
  current,
}: {
  selected: string;
  week: string;
  today: string;
  previous?: string;
  next?: string;
  current?: string;
}) {
  const { t, displayDateRange } = useI18n();
  const { follow } = useNavigation();
  const { data, error, retry } = useApi<{ items: StoredPlan[] }>(
    `/api/plans?${new URLSearchParams({ class: selected, week })}`,
  );
  const groups = CLASSES.map(({ id }) => ({
    id,
    plans: (data?.items || [])
      .filter((p) => p.classId === id)
      .sort((a, b) => a.month.localeCompare(b.month)),
  })).filter((group) => group.plans.length);
  return (
    <section className="week-planner" aria-labelledby="week-range">
      <header className="week-heading">
        <h2 id="week-range" aria-live="polite">
          {displayDateRange(week, endOfSchoolWeek(week))}
        </h2>
        <div className="week-pager">
          {previous ? (
            <a
              className="week-prev"
              href={previous}
              onClick={follow}
              aria-label={t("Previous week")}
              title={t("Previous week")}
            >
              <Icon name="chevron" size={18} />
            </a>
          ) : (
            <button
              type="button"
              className="week-prev"
              disabled
              aria-label={t("Previous week")}
            >
              <Icon name="chevron" size={18} />
            </button>
          )}
          {current && (
            <a
              href={current}
              onClick={follow}
              aria-current={week === startOfWeek(today) ? "date" : undefined}
            >
              {t("This week")}
            </a>
          )}
          {next ? (
            <a
              href={next}
              onClick={follow}
              aria-label={t("Next week")}
              title={t("Next week")}
            >
              <Icon name="chevron" size={18} />
            </a>
          ) : (
            <button type="button" disabled aria-label={t("Next week")}>
              <Icon name="chevron" size={18} />
            </button>
          )}
        </div>
      </header>
      {!data ? (
        <LoadState error={error} retry={retry} />
      ) : groups.length ? (
        <div className="week-layout">
          <WeekAgenda
            week={week}
            today={today}
            groups={groups}
            all={selected === "all"}
          />
          <WeekFocus groups={groups} />
        </div>
      ) : (
        <Empty title={t("No lesson plan for this week yet.")} icon="calendar">
          <a className="button" href={href({ view: "mail", class: selected })}>
            {t("Explore classroom mail")} <Icon name="arrow" size={18} />
          </a>
        </Empty>
      )}
    </section>
  );
}
