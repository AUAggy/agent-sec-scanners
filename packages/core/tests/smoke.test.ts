import { describe, it, expect } from "vitest";
import { CORE_PACKAGE } from "../src/index.js";

describe("workspace smoke", () => {
  it("resolves the core package module", () => {
    expect(CORE_PACKAGE).toBe("@miaggy/core");
  });
});
