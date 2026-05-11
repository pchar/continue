import { jest } from "@jest/globals";

import {
  isSecurityConcern,
  loadSecurityConcernConfigFromRules,
} from "./ignore";

describe("security concern overrides", () => {
  test("should flag default secret-like paths", () => {
    expect(isSecurityConcern("cluster-secrets/secrets/default/tls.yaml")).toBe(
      true,
    );
  });

  test("should disable security concern checks when enabled is false", () => {
    expect(
      isSecurityConcern("cluster-secrets/secrets/default/tls.yaml", {
        enabled: false,
      }),
    ).toBe(false);
  });

  test("should allow custom path patterns via allowPaths", () => {
    expect(
      isSecurityConcern("cluster-secrets/secrets/default/tls.yaml", {
        enabled: true,
        allowPaths: ["**/cluster-secrets/secrets/**"],
      }),
    ).toBe(false);
  });

  test("should block custom deny patterns", () => {
    expect(
      isSecurityConcern("docs/internal/credentials/readme.md", {
        enabled: true,
        denyPaths: ["**/internal/credentials/**"],
      }),
    ).toBe(true);
  });
});

describe("loadSecurityConcernConfigFromRules", () => {
  test("should merge security configs from per-workspace .continue/rules/security-rule.md", async () => {
    const mockIde = {
      getWorkspaceDirs: jest
        .fn<() => Promise<string[]>>()
        .mockResolvedValue(["file:///workspace-a", "file:///workspace-b"]),
      readFile: jest.fn<(path: string) => Promise<string>>((path: string) => {
        if (path === "file:///workspace-a/.continue/rules/security-rule.md") {
          return Promise.resolve(
            `---\nsecurityConcern:\n  enabled: true\n  allow:\n    - \"**/cluster-secrets/secrets/**\"\n---\n`,
          );
        }
        if (path === "file:///workspace-b/.continue/rules/security-rule.md") {
          return Promise.resolve(
            `---\nsecurityConcern:\n  deny:\n    - \"**/sensitive/custom/**\"\n---\n`,
          );
        }
        return Promise.reject(new Error("ENOENT"));
      }),
    };

    const config = await loadSecurityConcernConfigFromRules(mockIde as any);

    expect(config.enabled).toBe(true);
    expect(config.allowPaths).toContain("**/cluster-secrets/secrets/**");
    expect(config.denyPaths).toContain("**/sensitive/custom/**");
  });
});
