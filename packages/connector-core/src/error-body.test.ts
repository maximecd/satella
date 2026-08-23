import { describe, expect, it } from "vite-plus/test";

import { describeErrorBody } from "./error-body.js";

describe("provider error details", () => {
  it("includes useful fields nested inside an error response", () => {
    expect(
      describeErrorBody({
        error: {
          code: "invalid_pin",
          message: "The PIN was rejected",
        },
      }),
    ).toBe(" error.code=invalid_pin, error.message=The PIN was rejected");
  });
});
