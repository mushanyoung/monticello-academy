import type { StoredPlan } from "../shared/plans";
import { href } from "./api";
import { Icon } from "./art";
import { useI18n } from "./i18n";

export function SourceNoteItems({
  notes,
}: {
  notes: NonNullable<StoredPlan["sourceNotes"]>;
}) {
  const { t } = useI18n();
  return notes.map((note) => (
    <li key={JSON.stringify(note)}>
      <span>{note.description}</span>{" "}
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
  ));
}

export function PlanSources({ plan }: { plan: StoredPlan }) {
  const { t, displayDate } = useI18n();
  return (
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
        {t("Read the source email")} <Icon name="arrow" size={18} />
      </a>
      <span>
        {t("Updated")} {displayDate(plan.updatedAt)}
      </span>
    </div>
  );
}
