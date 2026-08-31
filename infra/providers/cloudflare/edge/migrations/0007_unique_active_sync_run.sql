CREATE UNIQUE INDEX provider_sync_runs_active_connection_uq
  ON provider_sync_runs(provider_connection_id)
  WHERE status IN ('queued', 'running', 'retry_wait');
