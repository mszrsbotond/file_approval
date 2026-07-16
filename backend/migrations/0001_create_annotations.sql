-- Pin-alapú vizuális visszajelzés (annotáció) tárolása kép és PDF fájlokhoz.
-- version_id/annotation_id VARCHAR, mert a versions.version_id is character varying (nem natív UUID).
CREATE TABLE IF NOT EXISTS annotations (
    annotation_id VARCHAR PRIMARY KEY,
    version_id    VARCHAR NOT NULL REFERENCES versions(version_id) ON DELETE CASCADE,
    filename      TEXT NOT NULL,
    page_number   INT NOT NULL DEFAULT 1,
    x             REAL NOT NULL,
    y             REAL NOT NULL,
    comment       TEXT NOT NULL,
    created_at    TIMESTAMP DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_annotations_version_filename
    ON annotations (version_id, filename);
