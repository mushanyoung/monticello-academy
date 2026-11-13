-- Source differences are published together. Historical migrations are immutable.
CREATE TRIGGER plans_no_drafts_insert BEFORE INSERT ON lesson_plans
WHEN NEW.status <> 'published' BEGIN SELECT RAISE(ABORT, 'Plans have no approval state'); END;
CREATE TRIGGER plans_no_drafts_update BEFORE UPDATE ON lesson_plans
WHEN NEW.status <> 'published' BEGIN SELECT RAISE(ABORT, 'Plans have no approval state'); END;
CREATE TRIGGER jobs_no_approval_insert BEFORE INSERT ON lesson_jobs
WHEN NEW.status = 'needs-review' BEGIN SELECT RAISE(ABORT, 'Jobs have no approval state'); END;
CREATE TRIGGER jobs_no_approval_update BEFORE UPDATE ON lesson_jobs
WHEN NEW.status = 'needs-review' BEGIN SELECT RAISE(ABORT, 'Jobs have no approval state'); END;
