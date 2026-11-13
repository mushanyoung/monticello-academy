CREATE TABLE lesson_plans (
 id TEXT PRIMARY KEY, class_id TEXT NOT NULL CHECK(class_id IN ('sunshine','guppy','twos')),
 month TEXT NOT NULL, source_message_id TEXT NOT NULL REFERENCES messages(id),
 status TEXT NOT NULL CHECK(status IN ('draft','published')), document TEXT NOT NULL,
 updated_at TEXT NOT NULL, UNIQUE(class_id,month)
);
CREATE TABLE plan_revisions (
 id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES lesson_plans(id),
 document TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX plans_month ON lesson_plans(month,class_id);
