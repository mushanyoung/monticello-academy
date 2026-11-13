import { CLASSES } from "../shared/classes";
import type { MailDetail, MailPage } from "../shared/models";
import { href, useApi } from "./api";
import { Icon } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";
import { EmailContent } from "./EmailContent";
import { useI18n } from "./i18n";

function MailReader({
  id,
  selected,
  q,
  sort,
}: {
  id: string;
  selected: string;
  q: string;
  sort: string;
}) {
  const { t, displayDate, language } = useI18n();
  const mail = useApi<MailDetail>(`/api/mail/${id}`);
  if (!mail.data) return <LoadState error={mail.error} retry={mail.retry} />;
  const item = mail.data;
  return (
    <article className="mail-reader">
      <a
        className="text-link back-link"
        href={href({ view: "mail", class: selected, q, sort })}
      >
        {t("← Back to mailbox")}
      </a>
      <div className="badges">
        {item.class_ids.length ? (
          item.class_ids.map((c) => <ClassBadge key={c} id={c} />)
        ) : (
          <span className="badge">{t("Classroom not identified")}</span>
        )}
      </div>
      <h2>{item.subject}</h2>
      <div className="sender-line">
        <span className="sender-avatar">
          {(item.sender_name || item.sender).slice(0, 1).toUpperCase()}
        </span>
        <div>
          <strong>{item.sender_name || item.sender}</strong>
          <span>{item.sender}</span>
        </div>
      </div>
      <p className="mail-date">
        {displayDate(item.sent_at, { dateStyle: "full", timeStyle: "short" })}{" "}
        {t("· Pacific time")}
      </p>
      <details className="mail-metadata">
        <summary>{t("Message details")}</summary>
        <p>
          {t("To:")}{" "}
          {item.recipients || t("Not included in the original headers")}
        </p>
        <p>
          {t("Archived:")}{" "}
          {displayDate(item.received_at, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
        <a href={`/api/original/${item.id}`}>
          {t("Download original email (.eml)")}
        </a>
      </details>
      <EmailContent
        key={`${item.id}-${language}`}
        id={item.id}
        text={item.body_text}
        attachments={item.attachments}
      />
    </article>
  );
}
export function Mailbox({
  selected,
  params,
}: {
  selected: string;
  params: URLSearchParams;
}) {
  const { t, displayDate, className } = useI18n();
  const q = params.get("q") || "";
  const sort = params.get("sort") || "newest";
  const page = params.get("page") || "1";
  const id = params.get("id");
  const query = new URLSearchParams({ class: selected, q, sort, page });
  const mail = useApi<MailPage>(`/api/mail?${query}`);
  return (
    <div className={`mail-page ${id ? "reading" : ""}`}>
      <header className="page-heading">
        <span className="eyebrow">{t("THE CLASSROOM POST")}</span>
        <h1>
          {t("A little mail.")}
          <br />
          <span>{t("A lot to keep.")}</span>
        </h1>
        <p>{t("Every update and attachment, right where you need it.")}</p>
        <span className="heading-doodle">
          <Icon name="mail" size={85} />
        </span>
      </header>
      <ClassFilters view="mail" selected={selected} />
      <search>
        <form className="search-form" action="/" method="get">
          <input type="hidden" name="view" value="mail" />
          <input type="hidden" name="class" value={selected} />
          <label className="search-field">
            <Icon name="search" size={19} />
            <span className="sr-only">{t("Search mail")}</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={200}
              placeholder={t("Search words, senders, or attachment names…")}
            />
          </label>
          <label className="sort-field">
            <span className="sr-only">{t("Sort by time")}</span>
            <select name="sort" defaultValue={sort}>
              <option value="newest">{t("Newest first")}</option>
              <option value="oldest">{t("Oldest first")}</option>
            </select>
          </label>
          <button type="submit" className="button">
            {t("Search")} <Icon name="arrow" size={17} />
          </button>
        </form>
      </search>
      <div className={`mail-layout ${id ? "has-detail" : ""}`}>
        <section className="mail-results" aria-label={t("Email results")}>
          {mail.data ? (
            <>
              <div className="results-heading">
                <span>
                  {t(
                    mail.data.total === 1 ? "{count} email" : "{count} emails",
                    { count: mail.data.total },
                  )}
                  {q
                    ? t(" matching “{query}”", { query: q })
                    : t(" in your notebook")}
                </span>
                {q && (
                  <a href={href({ view: "mail", class: selected })}>
                    {t("Clear search")}
                  </a>
                )}
              </div>
              {mail.data.items.length ? (
                <div className="mail-list">
                  {mail.data.items.map((item) => (
                    <a
                      key={item.id}
                      className={`mail-item ${id === item.id ? "active" : ""}`}
                      href={href({
                        view: "mail",
                        class: selected,
                        q,
                        sort,
                        page,
                        id: item.id,
                      })}
                    >
                      <div className="mail-item-top">
                        <span>{item.sender_name || item.sender}</span>
                        <time dateTime={item.sent_at}>
                          {displayDate(item.sent_at)}
                        </time>
                      </div>
                      <h3>{item.subject}</h3>
                      <p>
                        {item.snippet || t("An update from the classroom.")}
                      </p>
                      <div className="mail-item-bottom">
                        <div className="badges">
                          {item.class_ids.map((c) => (
                            <ClassBadge key={c} id={c} />
                          ))}
                        </div>
                        {item.attachment_count > 0 && (
                          <span
                            className="attachment-count"
                            title={t("All files, including inline images")}
                          >
                            <Icon name="clip" size={14} />
                            {item.attachment_count}
                            <span className="sr-only">
                              {" "}
                              {t("files, including inline images")}
                            </span>
                          </span>
                        )}
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <Empty
                  title={
                    q
                      ? t("No notes found this time.")
                      : t("A fresh page in the notebook.")
                  }
                >
                  <p>
                    {q
                      ? t(
                          "Try a different word or classroom. You can also search attachment names.",
                        )
                      : t(
                          "Emails for {classroom} will appear here when they arrive.",
                          {
                            classroom: CLASSES.some((c) => c.id === selected)
                              ? className(
                                  CLASSES.find((c) => c.id === selected)?.id ||
                                    "sunshine",
                                )
                              : t("the classrooms"),
                          },
                        )}
                  </p>
                </Empty>
              )}
              {mail.data.total > mail.data.pageSize && (
                <nav className="pagination" aria-label={t("Email pages")}>
                  {mail.data.page > 1 ? (
                    <a
                      href={href({
                        view: "mail",
                        class: selected,
                        q,
                        sort,
                        page: mail.data.page - 1,
                      })}
                    >
                      {t("← Previous")}
                    </a>
                  ) : (
                    <span />
                  )}
                  <span>
                    {t("Page {page} of {total}", {
                      page: mail.data.page,
                      total: Math.ceil(mail.data.total / mail.data.pageSize),
                    })}
                  </span>
                  {mail.data.page * mail.data.pageSize < mail.data.total ? (
                    <a
                      href={href({
                        view: "mail",
                        class: selected,
                        q,
                        sort,
                        page: mail.data.page + 1,
                      })}
                    >
                      {t("Next →")}
                    </a>
                  ) : (
                    <span />
                  )}
                </nav>
              )}
            </>
          ) : (
            <LoadState error={mail.error} retry={mail.retry} />
          )}
        </section>
        {id && <MailReader id={id} selected={selected} q={q} sort={sort} />}
      </div>
    </div>
  );
}
