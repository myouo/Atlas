# Synchronization Worker

The Worker is a separate process boundary reserved for Phase 4. It will dequeue pg-boss jobs, invoke a Connector, persist raw and Provider-native records, and rebuild Widget projections.

No real Provider access is implemented in Phase 1.
