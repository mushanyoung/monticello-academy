import { useEffect, useRef, useState } from "react";
import type { Attachment } from "../shared/models";
import { Attachments } from "./Attachments";
import { useI18n } from "./i18n";

export function EmailContent({
  id,
  text,
  attachments,
}: {
  id: string;
  text: string;
  attachments: Attachment[];
}) {
  const { t, language } = useI18n();
  const [mode, setMode] = useState<"original" | "text">("original");
  const [hasHtml, setHasHtml] = useState(true);
  const [images, setImages] = useState(false);
  const [externalImages, setExternalImages] = useState(0);
  const [failed, setFailed] = useState(false);
  const [inlineSources, setInlineSources] = useState<Set<string>>(new Set());
  const visibleAttachments = attachments.filter(
    (file) =>
      mode !== "original" ||
      failed ||
      !inlineSources.has(`/api/attachments/${file.id}?preview=1`),
  );
  const observer = useRef<ResizeObserver | null>(null);
  const resizeTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      observer.current?.disconnect();
      if (resizeTimer.current !== null)
        window.clearTimeout(resizeTimer.current);
    },
    [],
  );
  return (
    <>
      <section className="email-content" aria-label={t("Message content")}>
        {hasHtml && (
          <fieldset
            className="email-view-options"
            aria-label={t("Email display")}
          >
            <button
              type="button"
              aria-pressed={mode === "original"}
              onClick={() => {
                setMode("original");
                setFailed(false);
              }}
            >
              {t("Original formatting")}
            </button>
            <button
              type="button"
              aria-pressed={mode === "text"}
              onClick={() => setMode("text")}
            >
              {t("Plain text")}
            </button>
          </fieldset>
        )}
        {externalImages > 0 && !images && mode === "original" && !failed && (
          <div className="email-image-notice">
            <span>{t("External images are hidden.")}</span>
            <button type="button" onClick={() => setImages(true)}>
              {t("Load external images")}
            </button>
          </div>
        )}
        {failed && (
          <p role="status" className="email-view-error">
            {t(
              "Original formatting couldn't be loaded. Plain text is shown below; choose Original formatting to retry.",
            )}
          </p>
        )}
        {mode === "original" && !failed ? (
          <iframe
            className="email-frame"
            title={t("Original email content")}
            src={`/api/mail/${id}/content?lang=${language}${images ? "&images=1" : ""}`}
            sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            referrerPolicy="no-referrer"
            onLoad={(event) => {
              observer.current?.disconnect();
              if (resizeTimer.current !== null)
                window.clearTimeout(resizeTimer.current);
              const frame = event.currentTarget;
              const doc = frame.contentDocument;
              if (doc?.documentElement.dataset.emailReady !== "true") {
                setFailed(true);
                return;
              }
              if (doc.documentElement.dataset.hasHtml !== "true") {
                setHasHtml(false);
                setMode("text");
                return;
              }
              setExternalImages(
                Number(doc.documentElement.dataset.externalImages) || 0,
              );
              // Only remove duplicates that actually rendered in this document.
              // MIME disposition and file type alone do not prove inline use.
              setInlineSources(
                new Set(
                  Array.from(doc.images)
                    .filter((image) => {
                      const rect = image.getBoundingClientRect();
                      return (
                        image.complete &&
                        image.naturalWidth > 0 &&
                        rect.width > 0 &&
                        rect.height > 0 &&
                        doc.defaultView?.getComputedStyle(image).visibility ===
                          "visible"
                      );
                    })
                    .map((image) => image.getAttribute("src") || ""),
                ),
              );
              const resize = () => {
                if (!frame.isConnected) return;
                const height = `${Math.min(30000, Math.max(120, Math.ceil(doc.body.getBoundingClientRect().height) + 24))}px`;
                if (frame.style.height !== height) frame.style.height = height;
              };
              // Observe in the document's own window so cross-frame layout does
              // not trigger ResizeObserver delivery loops in Chromium.
              const ContentResizeObserver = (
                doc.defaultView as Window & typeof globalThis
              ).ResizeObserver;
              observer.current = new ContentResizeObserver(() => {
                if (resizeTimer.current !== null)
                  window.clearTimeout(resizeTimer.current);
                resizeTimer.current = window.setTimeout(resize, 0);
              });
              observer.current.observe(doc.body);
              resizeTimer.current = window.setTimeout(resize, 0);
            }}
          />
        ) : (
          <div className="mail-body">
            {text ||
              t(
                "This email has no text body. See the attachments or download the original email.",
              )}
          </div>
        )}
      </section>
      <Attachments items={visibleAttachments} />
    </>
  );
}
