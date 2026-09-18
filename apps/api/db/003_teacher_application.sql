BEGIN;

ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS grade varchar(40) NOT NULL DEFAULT '';
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS experience text NOT NULL DEFAULT '';
ALTER TABLE teacher_profiles ADD COLUMN IF NOT EXISTS sports_experience text NOT NULL DEFAULT '';
ALTER TABLE teacher_subjects ADD COLUMN IF NOT EXISTS age_range varchar(60) NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_profile_id uuid NOT NULL REFERENCES teacher_profiles(id),
  type varchar(24) NOT NULL CHECK (type IN ('initial', 'profile_change', 'qualification_change')),
  status varchar(24) NOT NULL CHECK (status IN ('submitted', 'changes_requested', 'approved', 'rejected')),
  submitted_snapshot jsonb NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text
);

CREATE UNIQUE INDEX IF NOT EXISTS verifications_one_pending_idx ON verifications (teacher_profile_id)
  WHERE status = 'submitted';
CREATE INDEX IF NOT EXISTS verifications_teacher_idx ON verifications (teacher_profile_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS verification_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES verifications(id) ON DELETE CASCADE,
  kind varchar(24) NOT NULL CHECK (kind IN ('student_proof', 'sports_proof')),
  storage_key varchar(120) NOT NULL UNIQUE,
  mime_type varchar(32) NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (verification_id, kind)
);

COMMIT;
