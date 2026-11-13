import type { Attachment } from "../shared/models";
import { Icon } from "./art";
import { useI18n } from "./i18n";

export function Attachments({ items }: { items: Attachment[] }) {
  const { t } = useI18n();
  return (
    items.length > 0 && (
      <section className="attachments">
        <h3>
          <Icon name="clip" size={19} />
          {t(
            items.length === 1 ? "{count} attachment" : "{count} attachments",
            { count: items.length },
          )}
        </h3>
        {items.map((a) => (
          <div className="attachment" key={a.id}>
            <span className="file-icon">
              <Icon name="book" />
            </span>
            <div>
              <strong>{a.filename}</strong>
              <span>
                {a.size < 1024
                  ? `${a.size} B`
                  : `${Math.ceil(a.size / 1024)} KB`}{" "}
                · {a.content_type}
              </span>
            </div>
            <div className="file-actions">
              {[
                "application/pdf",
                "image/png",
                "image/jpeg",
                "image/gif",
                "image/webp",
                "text/plain",
              ].includes(a.content_type) && (
                <a
                  href={`/api/attachments/${a.id}?preview=1`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("View")}
                  <span className="sr-only">
                    {" "}
                    {a.filename} {t("in a new tab")}
                  </span>
                </a>
              )}
              <a
                className="icon-button"
                href={`/api/attachments/${a.id}`}
                aria-label={t("Download {filename}", { filename: a.filename })}
              >
                <Icon name="download" size={20} />
              </a>
            </div>
          </div>
        ))}
      </section>
    )
  );
}
