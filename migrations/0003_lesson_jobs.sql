CREATE TABLE lesson_jobs (
 id TEXT PRIMARY KEY,
 attachment_id TEXT NOT NULL REFERENCES attachments(id),
 message_id TEXT NOT NULL REFERENCES messages(id),
 content_key TEXT NOT NULL,
 parser_version TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','needs-review','published','ignored','failed')),
 notify INTEGER NOT NULL DEFAULT 1 CHECK(notify IN (0,1)),
 attempt INTEGER NOT NULL DEFAULT 1,
 response_id TEXT,
 result_key TEXT,
 issues TEXT NOT NULL DEFAULT '[]',
 error_code TEXT,
 error_message TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(content_key,parser_version)
);
CREATE INDEX lesson_jobs_status ON lesson_jobs(status,updated_at);
CREATE TABLE lesson_alerts (
 id TEXT PRIMARY KEY,
 job_id TEXT REFERENCES lesson_jobs(id),
 subject TEXT NOT NULL,
 body TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('pending','sending','sent')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TEXT NOT NULL,
 provider_message_id TEXT,
 created_at TEXT NOT NULL,
 sent_at TEXT
);
CREATE INDEX lesson_alerts_pending ON lesson_alerts(status,next_attempt_at);
