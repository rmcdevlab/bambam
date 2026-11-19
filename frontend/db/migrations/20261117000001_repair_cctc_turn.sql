-- +goose Up
-- อาคาร CCTC stood the wrong way round on the S29 site view (owner 2026-11-17, after the model was reshaped from
-- the photo, D-161): the CR-027 map frame fixed the block's line, not which end is which. Turned 180°: the 4.8 m roof
-- overhang (plan row D, model +z) now faces Warehouse 2 and the entrance end (grid 1, model −x) the north-east.
-- Data only; the model and its floor plans keep their own coordinates.
UPDATE platform.site_blocks SET rot_deg = 118.3, updated_at = now() WHERE map_no = 10;

-- +goose Down
UPDATE platform.site_blocks SET rot_deg = -61.7, updated_at = now() WHERE map_no = 10;
