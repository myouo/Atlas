import { FixtureProviderRuntime } from "@nivalis/connectors";
import { ProviderProtocolError } from "@nivalis/domain";
import { describe, expect, it } from "vitest";

import { StaticProviderRuntimeRegistry } from "./index";

describe("StaticProviderRuntimeRegistry", () => {
  it("validates manifests and rejects duplicate Provider ownership at composition time", () => {
    const runtime = new FixtureProviderRuntime();
    expect(new StaticProviderRuntimeRegistry([runtime]).get("fixture")).toBe(runtime);
    expect(() => new StaticProviderRuntimeRegistry([runtime, runtime])).toThrow(
      ProviderProtocolError
    );
  });
});
