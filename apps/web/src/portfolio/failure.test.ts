import { FinanceApiError } from "@satella-app/engine/api";
import { describe, expect, it } from "vite-plus/test";

import { PortfolioFailure, toPortfolioFailure } from "./failure";

describe("portfolio failure model", () => {
  it("keeps an existing PortfolioFailure", () => {
    const failure = new PortfolioFailure("conflict", "Reporting currency is already in use");
    expect(toPortfolioFailure(failure)).toBe(failure);
  });

  it("maps a FinanceApiError onto the frontend failure model", () => {
    const mapped = toPortfolioFailure(
      new FinanceApiError({ code: "not_found", message: "Settings were not found" }),
    );
    expect(mapped).toBeInstanceOf(PortfolioFailure);
    expect(mapped.code).toBe("not_found");
    expect(mapped.message).toBe("Settings were not found");
  });

  it("maps a tagged engine error object", () => {
    const mapped = toPortfolioFailure({
      _tag: "FinanceApiError",
      code: "read_only",
      message: "Reporting currency cannot be changed",
    });
    expect(mapped.code).toBe("read_only");
    expect(mapped.message).toBe("Reporting currency cannot be changed");
  });

  it("maps Vault-closed engine failures", () => {
    const mapped = toPortfolioFailure(
      new FinanceApiError({ code: "vault_closed", message: "The Vault is locked." }),
    );
    expect(mapped.code).toBe("vault_closed");
    expect(mapped.message).toBe("The Vault is locked.");
  });

  it("treats transport failures as unavailable", () => {
    const mapped = toPortfolioFailure(new TypeError("Failed to fetch"));
    expect(mapped.code).toBe("unavailable");
    expect(mapped.message).toBe("Failed to fetch");
  });
});
