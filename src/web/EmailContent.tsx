import { useEffect, useRef, useState } from "react";

export function EmailContent({ id, text }: { id: string; text: string }) {
  const [mode, setMode] = useState<"original" | "text">("original");
  const [hasHtml, setHasHtml] = useState(true);
  const [images, setImages] = useState(false);
  const [externalImages, setExternalImages] = useState(0);
  const [failed, setFailed] = useState(false);
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
    <section className="email-content" aria-label="Message content">
      {hasHtml && (
        <fieldset className="email-view-options" aria-label="Email display">
          <button
            type="button"
            aria-pressed={mode === "original"}
            onClick={() => {
              setMode("original");
              setFailed(false);
            }}
          >
            Original formatting
          </button>
          <button
            type="button"
            aria-pressed={mode === "text"}
            onClick={() => setMode("text")}
          >
            Plain text
          </button>
        </fieldset>
      )}
      {externalImages > 0 && !images && mode === "original" && !failed && (
        <div className="email-image-notice">
          <span>External images are hidden.</span>
          <button type="button" onClick={() => setImages(true)}>
            Load external images
          </button>
        </div>
      )}
      {failed && (
        <p role="status" className="email-view-error">
          Original formatting couldn't be loaded. Plain text is shown below;
          choose Original formatting to retry.
        </p>
      )}
      {mode === "original" && !failed ? (
        <iframe
          className="email-frame"
          title="Original email content"
          src={`/api/mail/${id}/content${images ? "?images=1" : ""}`}
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
            "This email has no text body. See the attachments or download the original email."}
        </div>
      )}
    </section>
  );
}
