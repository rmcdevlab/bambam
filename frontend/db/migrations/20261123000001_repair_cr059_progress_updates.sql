-- +goose Up
-- CR-059 (owner 2026-11-23): while a job is in progress (in repair or reworking) a technician or Admin posts
-- progress updates — a message + 0–5 photos — that everyone who can see the ticket reads in the timeline.
--  * timeline event `progress_updated` (note = the message), its photos have kind `progress`;
--  * permission `repair.ticket.update_progress`: every role that can work on tickets, plus admin
--    (super_admin holds every key in code; its row is seeded like the other keys).
ALTER TABLE repair.ticket_events DROP CONSTRAINT ticket_events_type_check;
ALTER TABLE repair.ticket_events ADD CONSTRAINT ticket_events_type_check CHECK (type IN (
    'created', 'subscribed', 'assessed', 'assessment_changed', 'resolved', 'sent_back', 'confirmed',
    'auto_closed', 'team_handled', 'handed_over', 'admin_closed', 'priority_changed', 'progress_updated'));

ALTER TABLE repair.ticket_photos DROP CONSTRAINT ticket_photos_kind_check;
ALTER TABLE repair.ticket_photos ADD CONSTRAINT ticket_photos_kind_check
    CHECK (kind IN ('report', 'result', 'send_back', 'follow', 'team', 'progress'));

INSERT INTO platform.role_permissions (role_id, permission)
SELECT DISTINCT r.id, 'repair.ticket.update_progress'
FROM platform.roles r
WHERE r.key IN ('admin', 'super_admin')
   OR EXISTS (SELECT 1 FROM platform.role_permissions rp WHERE rp.role_id = r.id AND rp.permission = 'repair.ticket.work')
ON CONFLICT DO NOTHING;

-- an S24 page open since before this migration gets VERSION_CONFLICT instead of saving over it
UPDATE platform.permission_matrix SET version = version + 1, updated_at = now();

-- +goose Down
DELETE FROM platform.role_permissions WHERE permission = 'repair.ticket.update_progress';
UPDATE platform.permission_matrix SET version = version + 1, updated_at = now();

-- the updates' photos become unattached again, so the 24 h cleanup (DeleteUnattachedPhotos) removes their files
UPDATE repair.photos SET attached_at = NULL, updated_at = now()
WHERE id IN (SELECT photo_id FROM repair.ticket_photos WHERE kind = 'progress');
DELETE FROM repair.ticket_photos WHERE kind = 'progress';
DELETE FROM repair.ticket_events WHERE type = 'progress_updated';

ALTER TABLE repair.ticket_photos DROP CONSTRAINT ticket_photos_kind_check;
ALTER TABLE repair.ticket_photos ADD CONSTRAINT ticket_photos_kind_check
    CHECK (kind IN ('report', 'result', 'send_back', 'follow', 'team'));

ALTER TABLE repair.ticket_events DROP CONSTRAINT ticket_events_type_check;
ALTER TABLE repair.ticket_events ADD CONSTRAINT ticket_events_type_check CHECK (type IN (
    'created', 'subscribed', 'assessed', 'assessment_changed', 'resolved', 'sent_back', 'confirmed',
    'auto_closed', 'team_handled', 'handed_over', 'admin_closed', 'priority_changed'));
