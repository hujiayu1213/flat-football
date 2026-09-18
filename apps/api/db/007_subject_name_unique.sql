BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS subjects_name_ci_idx ON subjects (lower(name));

COMMIT;
