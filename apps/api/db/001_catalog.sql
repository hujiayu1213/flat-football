BEGIN;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone varchar(32) UNIQUE NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teacher_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  display_name varchar(80) NOT NULL,
  school varchar(120) NOT NULL,
  service_area varchar(120) NOT NULL,
  bio text NOT NULL DEFAULT '',
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'paused', 'rejected')),
  accepting_bookings boolean NOT NULL DEFAULT false,
  approved_at timestamptz,
  CONSTRAINT active_teacher_approved CHECK (status <> 'active' OR approved_at IS NOT NULL),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL UNIQUE,
  category varchar(16) NOT NULL CHECK (category IN ('academic', 'sports')),
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden')),
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS teacher_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_profile_id uuid NOT NULL REFERENCES teacher_profiles(id),
  subject_id uuid NOT NULL REFERENCES subjects(id),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  venue_requirements text,
  guardian_required boolean NOT NULL DEFAULT false,
  status varchar(16) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  UNIQUE (teacher_profile_id, subject_id, duration_minutes)
);

CREATE INDEX IF NOT EXISTS teacher_profiles_visible_idx ON teacher_profiles (approved_at DESC)
  WHERE status = 'active' AND accepting_bookings = true;
CREATE INDEX IF NOT EXISTS teacher_subjects_subject_idx ON teacher_subjects (subject_id, teacher_profile_id)
  WHERE status = 'active';

INSERT INTO subjects (name, category, sort_order) VALUES
  ('小学数学', 'academic', 10),
  ('初中数学', 'academic', 20),
  ('高中数学', 'academic', 30),
  ('英语', 'academic', 40),
  ('腰旗橄榄球', 'sports', 10),
  ('篮球', 'sports', 20)
ON CONFLICT (name) DO NOTHING;

COMMIT;
