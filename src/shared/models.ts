import type { ClassId } from "./classes";
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
}
export interface Attachment {
  id: string;
  filename: string;
  content_type: string;
  size: number;
  text_status: string;
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
