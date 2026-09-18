BEGIN;

ALTER TABLE notifications ALTER COLUMN booking_id DROP NOT NULL;
ALTER TABLE notifications ADD COLUMN verification_id uuid REFERENCES verifications(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT notifications_target_check
  CHECK ((booking_id IS NOT NULL) <> (verification_id IS NOT NULL));
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('booking_requested', 'booking_cancelled', 'booking_confirmed',
                 'booking_declined', 'booking_teacher_cancelled',
                 'verification_approved', 'verification_changes_requested', 'verification_rejected'));

COMMIT;
