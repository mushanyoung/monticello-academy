CREATE TABLE messages (
 id TEXT PRIMARY KEY, message_key TEXT NOT NULL UNIQUE, content_hash TEXT NOT NULL UNIQUE,
 subject TEXT NOT NULL, sender TEXT NOT NULL, sender_name TEXT NOT NULL,
 recipients TEXT NOT NULL, sent_at TEXT NOT NULL, received_at TEXT NOT NULL,
 body_text TEXT NOT NULL, headers TEXT NOT NULL, raw_key TEXT NOT NULL, search_text TEXT NOT NULL
);
CREATE INDEX messages_sent ON messages(sent_at DESC, id);
CREATE TABLE message_classes (
 message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 class_id TEXT NOT NULL CHECK(class_id IN ('sunshine','guppy','twos')),
 PRIMARY KEY(message_id, class_id)
);
CREATE INDEX classes_messages ON message_classes(class_id, message_id);
CREATE TABLE attachments (
 id TEXT PRIMARY KEY, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
 filename TEXT NOT NULL, content_type TEXT NOT NULL, size INTEGER NOT NULL,
 object_key TEXT NOT NULL, extracted_text TEXT NOT NULL, text_status TEXT NOT NULL,
 UNIQUE(message_id, object_key, filename)
);
CREATE INDEX attachments_message ON attachments(message_id);
