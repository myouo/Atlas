# Provider Connectors

This package is the only home for Provider HTTP hosts, authentication formats, protocol/signature details, runtime response schemas, normalization, Provider-native persistence adapters, and Widget projection rules.

Implemented runtimes:

- `src/fixture`: development/test-only generic pipeline fixture; rejected in production.
- `src/netease`: minimal direct read-only NetEase client, Connector, sanitizer, TypeBox schemas, Normalizer, Native Store, Projector, and sanitized fixtures.

Application code sees only provider-neutral runtime/credential/native-store ports. The API process never imports this package; `apps/worker` selects modules in its composition root.

Every runtime implements the schema-driven [`nivalis.provider-data@2.0` protocol](../../docs/PROVIDER_INTEGRATION_PROTOCOL.md). Typed messages cover bounded collection, general partitions, replayable normalization, and projection while Provider-specific business semantics remain inside each adapter.
