import type { ClassId } from "./classes";
import type { TranslationStatus } from "./language";
export interface MailSummary {
  id: string;
  subject: string;
  sender: string;
  sender_name: string;
  sent_at: string;
  received_at: string;
  snippet: string;
  class_ids: ClassId[];
  attachment_count: number;
  translationStatus?: TranslationStatus;
}
export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  text_status: string;
  original_filename?: string;
}
export interface MailDetail extends MailSummary {
  body_text: string;
  recipients: string;
  headers: string;
  attachments: Attachment[];
}
export interface MailPage {
  items: MailSummary[];
  total: number;
  page: number;
  pageSize: number;
}
