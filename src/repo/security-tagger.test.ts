import { describe, it, expect } from "bun:test";
import { classifyRisk } from "./security-tagger";

describe("classifyRisk", () => {
  it("classifies auth paths as HIGH_RISK", () => {
    expect(classifyRisk("src/auth/middleware.ts")).toBe("HIGH_RISK");
  });

  it("classifies Startup.cs as HIGH_RISK", () => {
    expect(classifyRisk("Startup.cs")).toBe("HIGH_RISK");
  });

  it("classifies model paths as DATA_RISK", () => {
    expect(classifyRisk("src/models/User.ts")).toBe("DATA_RISK");
  });

  it("classifies API routes as MEDIUM_RISK", () => {
    expect(classifyRisk("src/api/routes/users.ts")).toBe("MEDIUM_RISK");
  });

  it("classifies generic paths as NORMAL", () => {
    expect(classifyRisk("src/utils/helpers.ts")).toBe("NORMAL");
  });

  it("applies security overrides", () => {
    expect(classifyRisk("src/payments/handler.ts", [
      { path: "src/payments/**", risk: "HIGH_RISK" },
    ])).toBe("HIGH_RISK");
  });

  it("is case-insensitive", () => {
    expect(classifyRisk("SRC/Auth/Middleware.ts")).toBe("HIGH_RISK");
  });

  it("classifies Identity paths as HIGH_RISK", () => {
    expect(classifyRisk("src/Identity/UserManager.cs")).toBe("HIGH_RISK");
  });

  it("classifies Authorization paths as HIGH_RISK", () => {
    expect(classifyRisk("src/Authorization/PolicyHandler.cs")).toBe("HIGH_RISK");
  });

  it("classifies token paths as HIGH_RISK", () => {
    expect(classifyRisk("src/token/refresh.ts")).toBe("HIGH_RISK");
  });

  it("classifies Repository paths as DATA_RISK", () => {
    expect(classifyRisk("src/Repository/UserRepo.cs")).toBe("DATA_RISK");
  });

  it("classifies DataAccess paths as DATA_RISK", () => {
    expect(classifyRisk("src/DataAccess/DbHelper.cs")).toBe("DATA_RISK");
  });

  it("classifies handler paths as MEDIUM_RISK", () => {
    expect(classifyRisk("src/api/handlers/user-handler.ts")).toBe("MEDIUM_RISK");
  });
});
