CREATE TABLE lesson_pdf_index (
 content_key TEXT PRIMARY KEY,
 class_id TEXT NOT NULL CHECK(class_id IN ('sunshine','guppy','twos')),
 search_text TEXT NOT NULL
);
CREATE INDEX attachments_content_message ON attachments(object_key,message_id);

-- Recover only confirmed, indexed PDFs with an unambiguous classroom in saved revisions.
INSERT INTO lesson_pdf_index(content_key,class_id,search_text)
SELECT j.content_key,min(p.class_id),max(a.extracted_text)
FROM plan_revisions r
JOIN lesson_plans p ON p.id=r.plan_id
JOIN json_each(r.document,'$.sources') s
JOIN lesson_jobs j ON j.attachment_id=json_extract(s.value,'$.attachmentId')
 AND j.message_id=json_extract(s.value,'$.messageId') AND j.status='published'
JOIN attachments a ON a.id=j.attachment_id AND a.text_status='extracted'
GROUP BY j.content_key HAVING count(DISTINCT p.class_id)=1;

INSERT OR IGNORE INTO message_classes(message_id,class_id)
SELECT a.message_id,i.class_id FROM attachments a JOIN lesson_pdf_index i ON i.content_key=a.object_key;

CREATE TRIGGER attach_known_lesson_class AFTER INSERT ON attachments BEGIN
 INSERT OR IGNORE INTO message_classes(message_id,class_id)
 SELECT NEW.message_id,class_id FROM lesson_pdf_index WHERE content_key=NEW.object_key;
END;
