BEGIN;

ALTER TABLE subjects ADD COLUMN service_key varchar(32) UNIQUE
  CHECK (service_key IS NULL OR service_key IN ('flag_football', 'tutoring'));
ALTER TABLE teacher_profiles ADD COLUMN education_level varchar(32) NOT NULL DEFAULT '大学在读';
ALTER TABLE teacher_profiles ADD COLUMN academic_strengths varchar(240) NOT NULL DEFAULT '';

INSERT INTO subjects (name, category, status, sort_order, service_key)
VALUES ('学科家教', 'academic', 'active', 20, 'tutoring')
ON CONFLICT (name) DO UPDATE SET status='active', service_key='tutoring';
UPDATE subjects SET status='active', service_key='flag_football' WHERE name='腰旗橄榄球';

UPDATE teacher_profiles tp SET academic_strengths=legacy.strengths
FROM (
  SELECT ts.teacher_profile_id, string_agg(DISTINCT s.name, '、' ORDER BY s.name) AS strengths
  FROM teacher_subjects ts JOIN subjects s ON s.id=ts.subject_id
  WHERE s.category='academic' AND s.service_key IS NULL AND ts.status='active'
  GROUP BY ts.teacher_profile_id
) legacy
WHERE tp.id=legacy.teacher_profile_id AND tp.academic_strengths='';

WITH ranked AS (
  SELECT ts.*, row_number() OVER (
    PARTITION BY ts.teacher_profile_id ORDER BY ts.price_cents, ts.duration_minutes, ts.id
  ) AS priority
  FROM teacher_subjects ts JOIN subjects s ON s.id=ts.subject_id
  WHERE s.category='academic' AND s.service_key IS NULL AND ts.status='active'
)
INSERT INTO teacher_subjects
  (teacher_profile_id, subject_id, price_cents, duration_minutes, age_range, venue_requirements, guardian_required, status)
SELECT ranked.teacher_profile_id, s.id, ranked.price_cents, ranked.duration_minutes,
       ranked.age_range, NULL, ranked.guardian_required, 'active'
FROM ranked CROSS JOIN subjects s
WHERE ranked.priority=1 AND s.service_key='tutoring'
ON CONFLICT (teacher_profile_id, subject_id, duration_minutes) DO NOTHING;

UPDATE teacher_subjects ts SET status='paused'
FROM subjects s WHERE s.id=ts.subject_id AND s.service_key IS NULL AND ts.status='active';

COMMIT;
