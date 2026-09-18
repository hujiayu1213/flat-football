BEGIN;

CREATE TABLE IF NOT EXISTS bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES users(id),
  teacher_profile_id uuid NOT NULL REFERENCES teacher_profiles(id),
  teacher_subject_id uuid NOT NULL REFERENCES teacher_subjects(id),
  status varchar(20) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'confirmed', 'declined', 'cancelled', 'completed')),
  starts_at timestamptz NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  child_age smallint NOT NULL CHECK (child_age BETWEEN 3 AND 25),
  meeting_area varchar(120) NOT NULL,
  request_note varchar(500) NOT NULL DEFAULT '',
  guardian_required boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bookings_parent_created_idx ON bookings (parent_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_teacher_starts_idx ON bookings (teacher_profile_id, starts_at)
  WHERE status IN ('requested', 'confirmed');
CREATE UNIQUE INDEX IF NOT EXISTS bookings_same_request_idx
  ON bookings (parent_user_id, teacher_subject_id, starts_at)
  WHERE status IN ('requested', 'confirmed');

COMMIT;
