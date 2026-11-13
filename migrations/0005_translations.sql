CREATE TABLE translation_jobs (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('mail','plan')),
 entity_id TEXT NOT NULL,
 source_hash TEXT NOT NULL,
 source_document TEXT NOT NULL,
 translator_version TEXT NOT NULL,
 workflow_id TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('queued','running','completed','superseded','failed')),
 attempt INTEGER NOT NULL DEFAULT 1,
 notify INTEGER NOT NULL DEFAULT 1 CHECK(notify IN (0,1)),
 input_key TEXT,
 error_code TEXT,
 error_message TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 UNIQUE(kind,entity_id,source_hash,translator_version)
);
CREATE INDEX translation_jobs_entity ON translation_jobs(kind,entity_id);
CREATE INDEX translation_jobs_status ON translation_jobs(status,updated_at);
CREATE TABLE translation_parts (
 job_id TEXT NOT NULL REFERENCES translation_jobs(id),
 part INTEGER NOT NULL,
 response_id TEXT,
 result_key TEXT,
 PRIMARY KEY(job_id,part)
);
CREATE TABLE mail_localizations (
 message_id TEXT NOT NULL REFERENCES messages(id),
 language TEXT NOT NULL CHECK(language IN ('zh','en')),
 source_document TEXT NOT NULL,
 subject TEXT NOT NULL,
 body_text TEXT NOT NULL,
 html_key TEXT NOT NULL,
 attachments TEXT NOT NULL,
 search_text TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(message_id,language)
);
CREATE TABLE plan_localizations (
 plan_id TEXT NOT NULL REFERENCES lesson_plans(id),
 language TEXT NOT NULL CHECK(language IN ('zh','en')),
 source_document TEXT NOT NULL,
 document TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(plan_id,language)
);
