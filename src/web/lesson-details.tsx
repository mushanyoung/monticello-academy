import type { LessonDay } from "../shared/plans";
import { useI18n } from "./i18n";
export function DayDetails({ day }: { day: LessonDay }) {
  const { t } = useI18n();
  return (
    <div>
      <p>
        <strong>{day.title}</strong>
        {day.noSchool ? t(" · No school") : ""}
      </p>
      {day.activities.map((activity) => (
        <p key={`${activity.area}-${activity.description}`}>
          <strong>{activity.area}:</strong> {activity.description}
        </p>
      ))}
      {day.bring.map((item) => (
        <p key={item}>
          {t("Bring:")} {item}
        </p>
      ))}
      {day.reminders.map((item) => (
        <p key={item}>
          {t("Remember:")} {item}
        </p>
      ))}
      {day.note && <p>{day.note}</p>}
      {day.sourceAttachmentId && (
        <a
          className="text-link"
          href={`/api/attachments/${day.sourceAttachmentId}?preview=1#page=${day.sourcePages?.[0] || 1}`}
        >
          {t("Source PDF · p.")} {day.sourcePages?.join(", ") || "1"}
        </a>
      )}
    </div>
  );
}

export function PlanDayBody({
  id,
  day,
  alternatives,
}: {
  id?: string;
  day: LessonDay;
  alternatives?: LessonDay[];
}) {
  const { t } = useI18n();
  return (
    <div className="plan-day-body" id={id}>
      {day.activities.map((a) => (
        <p className="plan-activity" key={`${a.area}-${a.description}`}>
          <strong>{a.area}</strong>
          <span className="activity-separator"> — </span>
          {a.description}
        </p>
      ))}
      {day.bring.length > 0 && (
        <p className="bring-note">
          <strong>{t("Bring along:")}</strong> {day.bring.join(" · ")}
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
          {t("Source PDF · p.")} {day.sourcePages?.join(", ") || "1"}
        </a>
      )}
      {alternatives?.map((entry) => (
        <div className="objectives" key={JSON.stringify(entry)}>
          <span className="small-label">
            {t("ALSO IN THE SOURCE DOCUMENTS")}
          </span>
          <DayDetails day={entry} />
        </div>
      ))}
    </div>
  );
}
