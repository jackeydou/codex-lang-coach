import { describe, expect, it } from "vitest";

import { neonAuthTokenVerification } from "./index";

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
