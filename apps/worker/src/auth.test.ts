import { describe, expect, it } from "vitest";

import worker, { neonAuthTokenVerification } from "./index";

describe("Neon Auth token verification", () => {
  it("uses the Managed Better Auth well-known JWKS endpoint", () => {
    expect(neonAuthTokenVerification("https://example.neonauth.aws.neon.tech/neondb/auth")).toEqual({
      jwksUrl: "https://example.neonauth.aws.neon.tech/neondb/auth/.well-known/jwks.json",
      issuer: "https://example.neonauth.aws.neon.tech",
    });
  });

  it("normalizes a trailing slash without changing the issuer", () => {
    expect(neonAuthTokenVerification("https://example.neonauth.aws.neon.tech/neondb/auth/")).toEqual({
      jwksUrl: "https://example.neonauth.aws.neon.tech/neondb/auth/.well-known/jwks.json",
      issuer: "https://example.neonauth.aws.neon.tech",
    });
  });
});

describe("API CORS preflight", () => {
  it("returns an empty 204 response for a local dashboard", async () => {
    const request = new Request("https://language-coach.example/api/sync-tokens", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:43129",
        "access-control-request-method": "POST",
        "access-control-request-headers": "authorization,content-type",
      },
    });

    const response = await worker.fetch(request, {} as never);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:43129");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    expect(await response.text()).toBe("");
  });
});
