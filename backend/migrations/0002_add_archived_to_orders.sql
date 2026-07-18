-- Rendelések archiválásának támogatása: archivált rendelések nem jelennek meg
-- a fő Kanban dashboardon, csak a külön Archívum oldalon.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_orders_archived ON orders (archived);
