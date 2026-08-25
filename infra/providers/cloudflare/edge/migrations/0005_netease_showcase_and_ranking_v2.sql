PRAGMA foreign_keys = ON;

-- Preserve immutable history while replacing the two incorrect current Widget semantics.
-- A legacy showcase without an explicit resource ID becomes an empty manual gallery; it
-- must never silently reinterpret the user's all-time #1 track as a homepage showcase.
CREATE TABLE _netease_widget_semantic_upgrades (
  old_revision_id TEXT PRIMARY KEY,
  new_revision_id TEXT NOT NULL,
  dashboard_id TEXT NOT NULL,
  revision_number INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

INSERT INTO _netease_widget_semantic_upgrades
  (old_revision_id, new_revision_id, dashboard_id, revision_number, created_at)
WITH current_revisions AS (
  SELECT id AS dashboard_id, current_published_revision_id AS revision_id FROM dashboards
  UNION
  SELECT id, current_draft_revision_id FROM dashboards
), candidates AS (
  SELECT
    current_revisions.dashboard_id,
    current_revisions.revision_id,
    ROW_NUMBER() OVER (
      PARTITION BY current_revisions.dashboard_id
      ORDER BY current_revisions.revision_id
    ) AS offset
  FROM current_revisions
  WHERE EXISTS (
    SELECT 1
    FROM dashboard_revision_widgets widgets
    WHERE widgets.revision_id = current_revisions.revision_id
      AND widgets.schema_version = 1
      AND widgets.widget_type IN ('music.netease.ranking', 'music.netease.showcase')
  )
)
SELECT
  candidates.revision_id,
  lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' ||
    substr(lower(hex(randomblob(2))), 2) || '-a' || substr(lower(hex(randomblob(2))), 2) || '-' ||
    lower(hex(randomblob(6))),
  candidates.dashboard_id,
  (SELECT MAX(revision_number) FROM dashboard_revisions existing
    WHERE existing.dashboard_id = candidates.dashboard_id) + candidates.offset,
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM candidates;

INSERT INTO dashboard_revisions
  (id, dashboard_id, revision_number, parent_revision_id,
   restored_from_revision_id, layout_json, operation, created_at, created_by)
SELECT
  upgrades.new_revision_id,
  source.dashboard_id,
  upgrades.revision_number,
  source.id,
  NULL,
  source.layout_json,
  'schema_upgrade',
  upgrades.created_at,
  NULL
FROM _netease_widget_semantic_upgrades upgrades
JOIN dashboard_revisions source ON source.id = upgrades.old_revision_id;

INSERT INTO dashboard_revision_widgets
  (revision_id, widget_id, widget_type, provider, schema_version,
   title, enabled, data_config_json, presentation_config_json, sort_order)
SELECT
  upgrades.new_revision_id,
  widget.widget_id,
  widget.widget_type,
  widget.provider,
  CASE
    WHEN widget.schema_version = 1 AND widget.widget_type IN (
      'music.netease.ranking', 'music.netease.showcase'
    ) THEN 2
    ELSE widget.schema_version
  END,
  CASE
    WHEN widget.schema_version = 1
      AND widget.widget_type = 'music.netease.ranking'
      AND widget.title = '网易云 · 听歌排行' THEN '网易云 · 听歌双榜'
    WHEN widget.schema_version = 1
      AND widget.widget_type = 'music.netease.showcase'
      AND widget.title = '网易云 · 音乐名片' THEN '网易云 · 音乐展柜'
    ELSE widget.title
  END,
  widget.enabled,
  CASE
    WHEN widget.schema_version = 1 AND widget.widget_type = 'music.netease.ranking' THEN
      json_object(
        'publicLimit', min(30, max(1, coalesce(json_extract(widget.data_config_json, '$.publicLimit'), 12))),
        'publicRanges', json_array('week', 'all_time')
      )
    WHEN widget.schema_version = 1 AND widget.widget_type = 'music.netease.showcase' THEN
      CASE
        WHEN json_type(widget.data_config_json, '$.resourceId') = 'text'
          AND length(json_extract(widget.data_config_json, '$.resourceId')) > 0
          AND json_extract(widget.data_config_json, '$.source') IN (
            'weekly_track', 'all_time_track', 'created_playlist', 'medal',
            'listening_duration', 'provider_music_card'
          )
        THEN json_object(
          'selections', json_array(json_object(
            'resourceId', json_extract(widget.data_config_json, '$.resourceId'),
            'source', json_extract(widget.data_config_json, '$.source')
          ))
        )
        ELSE json_object('selections', json('[]'))
      END
    ELSE widget.data_config_json
  END,
  CASE
    WHEN widget.schema_version = 1 AND widget.widget_type = 'music.netease.ranking' THEN
      json_patch('{"rankingStyle":"editorial","showPlayCount":true}', widget.presentation_config_json)
    WHEN widget.schema_version = 1 AND widget.widget_type = 'music.netease.showcase' THEN
      json_patch('{"galleryStyle":"editorial","showMeta":true}', widget.presentation_config_json)
    ELSE widget.presentation_config_json
  END,
  widget.sort_order
FROM _netease_widget_semantic_upgrades upgrades
JOIN dashboard_revision_widgets widget ON widget.revision_id = upgrades.old_revision_id;

UPDATE dashboards
SET
  current_draft_revision_id = coalesce(
    (SELECT new_revision_id FROM _netease_widget_semantic_upgrades
      WHERE old_revision_id = dashboards.current_draft_revision_id),
    current_draft_revision_id
  ),
  current_published_revision_id = coalesce(
    (SELECT new_revision_id FROM _netease_widget_semantic_upgrades
      WHERE old_revision_id = dashboards.current_published_revision_id),
    current_published_revision_id
  ),
  updated_at = CASE
    WHEN current_draft_revision_id IN (
      SELECT old_revision_id FROM _netease_widget_semantic_upgrades
    ) OR current_published_revision_id IN (
      SELECT old_revision_id FROM _netease_widget_semantic_upgrades
    ) THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    ELSE updated_at
  END;

DROP TABLE _netease_widget_semantic_upgrades;
