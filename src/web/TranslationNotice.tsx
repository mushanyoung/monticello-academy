import type { TranslationStatus } from "../shared/language";
import { useI18n } from "./i18n";
export function TranslationNotice({ status }: { status?: TranslationStatus }) {
  const { t } = useI18n();
  if (!status || status === "ready") return null;
  return (
    <p className="bring-note" role="status">
      {t(
        status === "translating"
          ? "Translation is being prepared. The original is shown for now."
          : "Translation is unavailable. The original is shown.",
      )}
    </p>
  );
}
