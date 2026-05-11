/**
 * Regression tests for multi-root workspace file operations.
 *
 * Tests the 4-step sequence an AI agent performs in a 3-root workspace
 * (thor-ai / sandbox / continue all under a common parent):
 *
 *   1. create sandbox/test/hello.c
 *   2. edit hello.c (add a printf line via single_find_and_replace)
 *   3. create sandbox/test/Makefile
 *   4. create sandbox/test/hello.h
 *
 * Verifies that path resolution is correct at every step and that
 * the sanitizeFilepath cleanup handles model artefacts.
 */

import { describe, expect, it } from "vitest";
import { validateSearchAndReplaceFilepath } from "../../edit/searchAndReplace/validateArgs";
import {
  inferResolvedUriFromRelativePath,
  resolveRelativePathInDir,
} from "../../util/ideUtils";
import { callBuiltInTool } from "../callTool";
import { BuiltInToolNames, CLIENT_TOOLS_IMPLS } from "../builtIn";
import { getBaseToolDefinitions } from "../index";
import { sanitizeFilepath } from "../parseArgs";

// ---------------------------------------------------------------------------
// Minimal IDE stub for a 3-root workspace (mirrors thor-ai.code-workspace)
// ---------------------------------------------------------------------------

const ROOT = "file:///Users/pch/MyProjects/DGJ";
const ROOTS = {
  thorai: `${ROOT}/thor-ai`,
  sandbox: `${ROOT}/sandbox`,
  continue: `${ROOT}/continue`,
};
const workspaceDirs = [ROOTS.thorai, ROOTS.sandbox, ROOTS.continue];

function makeIde(existingFiles: string[] = []) {
  return {
    getWorkspaceDirs: async () => workspaceDirs,
    fileExists: async (uri: string) => existingFiles.includes(uri),
    getCurrentFile: async () => null,
  } as any;
}

// ---------------------------------------------------------------------------
// sanitizeFilepath – strips accidental "filepath " model prefix
// ---------------------------------------------------------------------------

describe("sanitizeFilepath", () => {
  it("passes through normal paths untouched", () => {
    expect(sanitizeFilepath("sandbox/test/hello.c")).toBe(
      "sandbox/test/hello.c",
    );
    expect(sanitizeFilepath("sandbox/test/Makefile")).toBe(
      "sandbox/test/Makefile",
    );
    expect(sanitizeFilepath("sandbox/test/hello.h")).toBe(
      "sandbox/test/hello.h",
    );
  });

  it("strips 'filepath ' prefix (space-separated)", () => {
    expect(sanitizeFilepath("filepath sandbox/test/hello.c")).toBe(
      "sandbox/test/hello.c",
    );
  });

  it("strips 'filepath:' prefix (colon-separated)", () => {
    expect(sanitizeFilepath("filepath:sandbox/test/hello.c")).toBe(
      "sandbox/test/hello.c",
    );
  });

  it("strips 'filepath: ' prefix (colon + space)", () => {
    expect(sanitizeFilepath("filepath: sandbox/test/Makefile")).toBe(
      "sandbox/test/Makefile",
    );
  });

  it("is case-insensitive", () => {
    expect(sanitizeFilepath("FILEPATH sandbox/test/hello.h")).toBe(
      "sandbox/test/hello.h",
    );
  });

  it("trims leading/trailing whitespace", () => {
    expect(sanitizeFilepath("  sandbox/test/hello.c  ")).toBe(
      "sandbox/test/hello.c",
    );
  });
});

// ---------------------------------------------------------------------------
// inferResolvedUriFromRelativePath – used by create_new_file
// ---------------------------------------------------------------------------

describe("inferResolvedUriFromRelativePath (create)", () => {
  const ide = makeIde(); // no files exist yet

  it("step 1 – creates sandbox/test/hello.c at correct URI", async () => {
    const uri = await inferResolvedUriFromRelativePath(
      "sandbox/test/hello.c",
      ide,
    );
    expect(uri).toBe(`${ROOT}/sandbox/test/hello.c`);
  });

  it("step 3 – creates sandbox/test/Makefile at correct URI", async () => {
    const uri = await inferResolvedUriFromRelativePath(
      "sandbox/test/Makefile",
      ide,
    );
    expect(uri).toBe(`${ROOT}/sandbox/test/Makefile`);
  });

  it("step 4 – creates sandbox/test/hello.h at correct URI", async () => {
    const uri = await inferResolvedUriFromRelativePath(
      "sandbox/test/hello.h",
      ide,
    );
    expect(uri).toBe(`${ROOT}/sandbox/test/hello.h`);
  });

  it("rejects a path whose first segment is not a workspace root", async () => {
    await expect(
      inferResolvedUriFromRelativePath("test/hello.c", ide),
    ).rejects.toThrow(/not a workspace root name/);
  });

  it("rejects paths without a workspace root prefix in multi-root", async () => {
    await expect(
      inferResolvedUriFromRelativePath("hello.c", ide),
    ).rejects.toThrow();
  });

  it("correctly handles sanitized 'filepath ' prefix", async () => {
    const raw = "filepath sandbox/test/hello.c";
    const uri = await inferResolvedUriFromRelativePath(
      sanitizeFilepath(raw),
      ide,
    );
    expect(uri).toBe(`${ROOT}/sandbox/test/hello.c`);
  });
});

// ---------------------------------------------------------------------------
// resolveRelativePathInDir – used by read_file, single_find_and_replace, edit_existing_file
// ---------------------------------------------------------------------------

describe("resolveRelativePathInDir (read/edit)", () => {
  const existingFiles = [
    `${ROOT}/sandbox/test/hello.c`,
    `${ROOT}/sandbox/test/Makefile`,
    `${ROOT}/sandbox/test/hello.h`,
  ];
  const ide = makeIde(existingFiles);

  it("step 2 – resolves sandbox/test/hello.c for editing", async () => {
    const uri = await resolveRelativePathInDir("sandbox/test/hello.c", ide);
    expect(uri).toBe(`${ROOT}/sandbox/test/hello.c`);
  });

  it("step 3 – resolves sandbox/test/Makefile for reading/editing", async () => {
    const uri = await resolveRelativePathInDir("sandbox/test/Makefile", ide);
    expect(uri).toBe(`${ROOT}/sandbox/test/Makefile`);
  });

  it("step 4 – resolves sandbox/test/hello.h for reading/editing", async () => {
    const uri = await resolveRelativePathInDir("sandbox/test/hello.h", ide);
    expect(uri).toBe(`${ROOT}/sandbox/test/hello.h`);
  });

  it("returns undefined for a file that does not exist", async () => {
    const uri = await resolveRelativePathInDir(
      "sandbox/test/nonexistent.c",
      ide,
    );
    expect(uri).toBeUndefined();
  });

  it("returns undefined for a bare filename without root prefix", async () => {
    // bare filename should not accidentally match cross-root
    const uri = await resolveRelativePathInDir("hello.c", ide);
    expect(uri).toBeUndefined();
  });

  it("uses root-name priority: sandbox/test/hello.c resolves to sandbox root, not thor-ai", async () => {
    const uri = await resolveRelativePathInDir("sandbox/test/hello.c", ide);
    expect(uri).toMatch(/^file:\/\/\/Users\/pch\/MyProjects\/DGJ\/sandbox\//);
  });

  it("handles sanitized 'filepath ' prefix", async () => {
    const uri = await resolveRelativePathInDir(
      sanitizeFilepath("filepath sandbox/test/hello.c"),
      ide,
    );
    expect(uri).toBe(`${ROOT}/sandbox/test/hello.c`);
  });
});

// ---------------------------------------------------------------------------
// Full sequence simulation: create → edit → create Makefile → create header
// ---------------------------------------------------------------------------

describe("full 4-step sequence", () => {
  it("resolves all paths correctly in order", async () => {
    const created: string[] = [];
    const ideWithGrowingFs = {
      getWorkspaceDirs: async () => workspaceDirs,
      fileExists: async (uri: string) => created.includes(uri),
      getCurrentFile: async () => null,
    } as any;

    // Step 1: create sandbox/test/hello.c
    const helloUri = await inferResolvedUriFromRelativePath(
      "sandbox/test/hello.c",
      ideWithGrowingFs,
    );
    expect(helloUri).toBe(`${ROOT}/sandbox/test/hello.c`);
    created.push(helloUri);

    // Step 2: edit hello.c (resolveRelativePathInDir must find it)
    const helloEditUri = await resolveRelativePathInDir(
      "sandbox/test/hello.c",
      ideWithGrowingFs,
    );
    expect(helloEditUri).toBe(`${ROOT}/sandbox/test/hello.c`);

    // Step 3: create sandbox/test/Makefile (infer — file doesn't exist yet)
    const makefileUri = await inferResolvedUriFromRelativePath(
      "sandbox/test/Makefile",
      ideWithGrowingFs,
    );
    expect(makefileUri).toBe(`${ROOT}/sandbox/test/Makefile`);
    created.push(makefileUri);

    // Step 3b: Makefile is now findable for subsequent edits
    const makefileEditUri = await resolveRelativePathInDir(
      "sandbox/test/Makefile",
      ideWithGrowingFs,
    );
    expect(makefileEditUri).toBe(`${ROOT}/sandbox/test/Makefile`);

    // Step 4: create sandbox/test/hello.h
    const headerUri = await inferResolvedUriFromRelativePath(
      "sandbox/test/hello.h",
      ideWithGrowingFs,
    );
    expect(headerUri).toBe(`${ROOT}/sandbox/test/hello.h`);
    created.push(headerUri);

    // Verify no file landed in thor-ai or continue roots
    for (const uri of created) {
      expect(uri).not.toMatch(/\/thor-ai\//);
      expect(uri).not.toMatch(/\/continue\//);
      expect(uri).toMatch(/\/sandbox\/test\//);
    }
  });

  it("rejects a hallucinated double-prefixed path like 'sandbox/test/andbox/test/Makefile'", async () => {
    // This was a real hallucination observed in testing.
    // 'sandbox' root is matched, then 'test/andbox/test/Makefile' is the sub-path.
    // The file should NOT resolve to the correct location.
    const ide = makeIde([`${ROOT}/sandbox/test/Makefile`]);
    const wrongPath = "sandbox/test/andbox/test/Makefile";

    // inferResolvedUri resolves it to the WRONG location (not the Makefile)
    const wrongUri = await inferResolvedUriFromRelativePath(wrongPath, ide);
    expect(wrongUri).toBe(`${ROOT}/sandbox/test/andbox/test/Makefile`);
    expect(wrongUri).not.toBe(`${ROOT}/sandbox/test/Makefile`);

    // resolveRelativePathInDir returns undefined (file doesn't exist there)
    const found = await resolveRelativePathInDir(wrongPath, ide);
    expect(found).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Regression: validateSearchAndReplaceFilepath error message is actionable
//
// Caught in session 20260511T094546: single_find_and_replace returned
// "File X does not exist" when the file was on disk but couldn't be verified
// through the IDE proxy. The AI interpreted it as a missing file and looped.
// The error must name overwrite_file so the AI knows the next step.
// ---------------------------------------------------------------------------

describe("validateSearchAndReplaceFilepath error message", () => {
  it("names overwrite_file when file cannot be resolved", async () => {
    const ide = makeIde([]); // no files registered → resolveRelativePathInDir returns undefined
    let caught: Error | undefined;
    try {
      await validateSearchAndReplaceFilepath("sandbox/test/Makefile", ide);
    } catch (e: any) {
      caught = e;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toMatch(/overwrite_file/);
    expect(caught!.message).not.toMatch(/^File .* does not exist$/); // old terse message
  });

  it("resolves and returns without error when file exists", async () => {
    const uri = `${ROOT}/sandbox/test/hello.c`;
    const ide = makeIde([uri]);
    const result = await validateSearchAndReplaceFilepath(
      "sandbox/test/hello.c",
      ide,
    );
    expect(result).toBe(uri);
  });
});

// ---------------------------------------------------------------------------
// Regression: callBuiltInTool handles every server-side tool name
//
// Caught in session 20260511T094546: overwrite_file was added to
// getBaseToolDefinitions() and BuiltInToolNames but the callBuiltInTool
// switch was not updated, causing "Tool not found" at runtime.
//
// This test fails whenever a tool is added to getBaseToolDefinitions()
// without a corresponding case in callBuiltInTool.
// ---------------------------------------------------------------------------

describe("callBuiltInTool — no drift between definitions and switch", () => {
  it("every server-side base tool has a handler (not 'not found')", async () => {
    const serverToolNames = getBaseToolDefinitions()
      .map((t) => t.function.name)
      .filter((name) => !CLIENT_TOOLS_IMPLS.includes(name as BuiltInToolNames));

    const missing: string[] = [];

    for (const name of serverToolNames) {
      try {
        // Call with empty args and a null-stub extras.
        // We expect any error EXCEPT "Tool X not found".
        await callBuiltInTool(name, {}, {} as any);
      } catch (e: any) {
        if (e?.message?.includes(`"${name}" not found`)) {
          missing.push(name);
        }
        // Any other error (missing args, null ide, etc.) means the handler exists.
      }
    }

    expect(missing).toEqual([]); // fails if any tool falls through to the default case
  });
});
