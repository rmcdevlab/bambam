-- +goose Up
-- CR-058 (owner 2026-11-22): อาคาร TrialMix และห้องทดสอบหินทราย leaves the system. It is switched off, never
-- deleted (D-047, as the sample buildings in 20261020000003): it disappears from S03, the filters and S29;
-- its floor, rooms, floor plan and old tickets keep their references. Its map block and 3D shape go.
UPDATE platform.buildings SET is_active = false, model_key = NULL, updated_at = now()
WHERE id = 'c030b1d0-0000-4000-8000-000000000005';
DELETE FROM platform.site_blocks WHERE id = 'c0275b00-0000-4000-8000-000000000005';

-- +goose Down
INSERT INTO platform.site_blocks (id, map_no, name, building_id, x_m, z_m, rot_deg, width_m, depth_m, storeys, side)
VALUES ('c0275b00-0000-4000-8000-000000000005', 5, 'อาคาร TrialMix และห้องทดสอบหินทราย', 'c030b1d0-0000-4000-8000-000000000005', 65.80, -44.20, 7.1, 54.60, 13.71, 1, 1)
ON CONFLICT (id) DO NOTHING;
UPDATE platform.buildings SET is_active = true, model_key = 'b5', updated_at = now()
WHERE id = 'c030b1d0-0000-4000-8000-000000000005';
