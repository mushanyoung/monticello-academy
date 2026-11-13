import { CLASSES } from "../shared/classes";
import type { MailDetail, MailPage } from "../shared/models";
import { displayDate, href, useApi } from "./api";
import { Icon } from "./art";
import { ClassBadge, ClassFilters, Empty, LoadState } from "./components";
import { EmailContent } from "./EmailContent";

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
  const mail = useApi<MailDetail>(`/api/mail/${id}`);
  if (!mail.data) return <LoadState error={mail.error} retry={mail.retry} />;
  const item = mail.data;
  return (
    <article className="mail-reader">
      <a
        className="text-link back-link"
        href={href({ view: "mail", class: selected, q, sort })}
      >
        ← Back to mailbox
      </a>
      <div className="badges">
        {item.class_ids.length ? (
          item.class_ids.map((c) => <ClassBadge key={c} id={c} />)
        ) : (
          <span className="badge">Classroom not identified</span>
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
        {displayDate(item.sent_at, { dateStyle: "full", timeStyle: "short" })} ·
        Pacific time
      </p>
      <details className="mail-metadata">
        <summary>Message details</summary>
        <p>To: {item.recipients || "Not included in the original headers"}</p>
        <p>
          Archived:{" "}
          {displayDate(item.received_at, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
        <a href={`/api/original/${item.id}`}>Download original email (.eml)</a>
      </details>
      <EmailContent key={item.id} id={item.id} text={item.body_text} />
      {item.attachments.length > 0 && (
        <section className="attachments">
          <h3>
            <Icon name="clip" size={19} />
            {item.attachments.length} attachment
            {item.attachments.length === 1 ? "" : "s"}
          </h3>
          {item.attachments.map((a) => (
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
                    View
                    <span className="sr-only"> {a.filename} in a new tab</span>
                  </a>
                )}
                <a
                  className="icon-button"
                  href={`/api/attachments/${a.id}`}
                  aria-label={`Download ${a.filename}`}
                >
                  <Icon name="download" size={20} />
                </a>
              </div>
            </div>
          ))}
        </section>
      )}
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
  const q = params.get("q") || "";
  const sort = params.get("sort") || "newest";
  const page = params.get("page") || "1";
  const id = params.get("id");
  const query = new URLSearchParams({ class: selected, q, sort, page });
  const mail = useApi<MailPage>(`/api/mail?${query}`);
  return (
    <div className={`mail-page ${id ? "reading" : ""}`}>
      <header className="page-heading">
        <span className="eyebrow">THE CLASSROOM POST</span>
        <h1>
          A little mail.
          <br />
          <span>A lot to keep.</span>
        </h1>
        <p>Every update and attachment, right where you need it.</p>
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
            <span className="sr-only">Search mail</span>
            <input
              type="search"
              name="q"
              defaultValue={q}
              maxLength={200}
              placeholder="Search words, senders, or attachment names…"
            />
          </label>
          <label className="sort-field">
            <span className="sr-only">Sort by time</span>
            <select name="sort" defaultValue={sort}>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </label>
          <button type="submit" className="button">
            Search <Icon name="arrow" size={17} />
          </button>
        </form>
      </search>
      <div className={`mail-layout ${id ? "has-detail" : ""}`}>
        <section className="mail-results" aria-label="Email results">
          {mail.data ? (
            <>
              <div className="results-heading">
                <span>
                  {mail.data.total} {mail.data.total === 1 ? "email" : "emails"}
                  {q ? ` matching “${q}”` : " in your notebook"}
                </span>
                {q && (
                  <a href={href({ view: "mail", class: selected })}>
                    Clear search
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
                      <p>{item.snippet || "An update from the classroom."}</p>
                      <div className="mail-item-bottom">
                        <div className="badges">
                          {item.class_ids.map((c) => (
                            <ClassBadge key={c} id={c} />
                          ))}
                        </div>
                        {item.attachment_count > 0 && (
                          <span className="attachment-count">
                            <Icon name="clip" size={14} />
                            {item.attachment_count}
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
                      ? "No notes found this time."
                      : "A fresh page in the notebook."
                  }
                >
                  <p>
                    {q
                      ? "Try a different word or classroom. You can also search attachment names."
                      : `Emails for ${CLASSES.find((c) => c.id === selected)?.name || "the classrooms"} will appear here when they arrive.`}
                  </p>
                </Empty>
              )}
              {mail.data.total > mail.data.pageSize && (
                <nav className="pagination" aria-label="Email pages">
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
                      ← Previous
                    </a>
                  ) : (
                    <span />
                  )}
                  <span>
                    Page {mail.data.page} of{" "}
                    {Math.ceil(mail.data.total / mail.data.pageSize)}
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
                      Next →
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
