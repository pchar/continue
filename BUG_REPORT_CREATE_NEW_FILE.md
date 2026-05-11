# BUG REPORT: create_new_file Fails When Parent Directories Don't Exist

## Issue Summary

The `create_new_file` tool fails with a misleading error message when trying to create a file in a path where parent directories don't exist, despite the tool definition promising automatic parent directory creation.

**Error Message:** `create_new_file failed with the message: 'filepath' argument is required and must not be empty or whitespace-only. (type string)`

**Expected Behavior:** Parent directories should be created automatically.

---

## Reproduction Steps

1. In Continue chat, request file creation in a nested path:

   ```
   Create a file at sandbox/hello-charts/Chart.yaml
   ```

2. If `sandbox/hello-charts/` directory doesn't exist, the tool fails with the misleading error.

3. Attempting multiple times eventually succeeds (likely due to race condition where directory creation eventually happens).

---

## Root Cause Analysis

### Issue Location

- **File:** `core/tools/implementations/createNewFile.ts`
- **Lines:** 19-30

### The Problem

The tool **definition** (in `core/tools/definitions/createNewFile.ts` line 18) states:

```
"Parent directories are created automatically."
```

But the **implementation** does not create parent directories before writing the file:

```typescript
// Current implementation - NO parent directory creation
export const createNewFileImpl: ToolImpl = async (args, extras) => {
  const filepath = sanitizeFilepath(getStringArg(args, "filepath"));
  const contents = getStringArg(args, "contents", true);

  let resolvedFileUri: string;
  try {
    resolvedFileUri = await inferResolvedUriFromRelativePath(
      filepath,
      extras.ide,
    );
  } catch (err: any) {
    // ... error handling
  }

  // Missing: Create parent directories here!

  await extras.ide.writeFile(resolvedFileUri, contents); // ← Fails if parent dirs don't exist
  await extras.ide.openFile(resolvedFileUri);
  await extras.ide.saveFile(resolvedFileUri);
  // ...
};
```

### Error Message Issue

The error message "filepath argument is required and must not be empty" is misleading. The actual problem is that `writeFile()` can't create parent directories and fails silently or with a confusing message.

---

## Solution

### Step 1: Add Parent Directory Creation

Modify `core/tools/implementations/createNewFile.ts` to create parent directories before writing:

```typescript
import * as path from "path";
import { ensureDir } from "fs-extra"; // or import appropriate method

export const createNewFileImpl: ToolImpl = async (args, extras) => {
  const filepath = sanitizeFilepath(getStringArg(args, "filepath"));
  const contents = getStringArg(args, "contents", true);

  let resolvedFileUri: string;
  try {
    resolvedFileUri = await inferResolvedUriFromRelativePath(
      filepath,
      extras.ide,
    );
  } catch (err: any) {
    throw new ContinueError(
      ContinueErrorReason.PathResolutionFailed,
      err.message ?? "Failed to resolve path",
    );
  }

  throwIfFileIsSecurityConcern(getCleanUriPath(resolvedFileUri));
  const exists = await extras.ide.fileExists(resolvedFileUri);
  if (exists) {
    throw new ContinueError(
      ContinueErrorReason.FileAlreadyExists,
      `File already exists at: ${resolvedFileUri}\n` +
        `To replace its contents entirely, call overwrite_file with filepath "${filepath}".\n` +
        `To make targeted edits, call single_find_and_replace or edit_existing_file with filepath "${filepath}".\n` +
        `Do NOT use terminal commands (rm, echo, cat, etc.) to create or overwrite files.`,
    );
  }

  // NEW: Ensure parent directories exist
  const parentDir = path.dirname(resolvedFileUri);
  try {
    await ensureDir(parentDir); // Creates parent directories if they don't exist
  } catch (err: any) {
    throw new ContinueError(
      ContinueErrorReason.DirectoryCreationFailed,
      `Failed to create parent directories for: ${filepath}\n${err.message ?? ""}`,
    );
  }

  await extras.ide.writeFile(resolvedFileUri, contents);
  await extras.ide.openFile(resolvedFileUri);
  await extras.ide.saveFile(resolvedFileUri);
  if (extras.codeBaseIndexer) {
    void extras.codeBaseIndexer?.refreshCodebaseIndexFiles([resolvedFileUri]);
  }
  return [
    {
      name: getUriPathBasename(resolvedFileUri),
      description: getCleanUriPath(resolvedFileUri),
      content: [
        `File created successfully.`,
        `Workspace path: "${filepath}"`,
        `Use exactly this filepath for all subsequent tool calls on this file: read_file, edit_existing_file, single_find_and_replace.`,
      ].join("\n"),
      uri: {
        type: "file",
        value: resolvedFileUri,
      },
    },
  ];
};
```

### Step 2: Add Error Reason (if not exists)

In `core/util/errors.ts`, add the new error reason:

```typescript
export enum ContinueErrorReason {
  // ... existing reasons
  DirectoryCreationFailed = "directoryCreationFailed",
}
```

---

## Regression Tests

Create `core/tools/implementations/createNewFile.test.ts`:

```typescript
import { jest } from "@jest/globals";
import { createNewFileImpl } from "./createNewFile";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import * as path from "path";

const mockIde = {
  fileExists: jest.fn<(path: string) => Promise<boolean>>(),
  writeFile: jest
    .fn<(path: string, content: string) => Promise<void>>()
    .mockResolvedValue(undefined),
  openFile: jest
    .fn<(path: string) => Promise<void>>()
    .mockResolvedValue(undefined),
  saveFile: jest
    .fn<(path: string) => Promise<void>>()
    .mockResolvedValue(undefined),
};

const mockExtras = {
  ide: mockIde,
  codeBaseIndexer: undefined,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockIde.fileExists.mockResolvedValue(false);
});

describe("createNewFileImpl", () => {
  test("should create a simple file in existing directory", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "test.txt",
      contents: "Hello World",
    };

    await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalled();
    const [filePath, content] = mockIde.writeFile.mock.calls[0];
    expect(content).toBe("Hello World");
  });

  test("should create file with auto-created parent directories", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "nested/path/to/file.txt",
      contents: "Test content",
    };

    // Mock the directory creation
    const ensureDirSpy = jest.fn().mockResolvedValue(undefined);
    (global as any).ensureDir = ensureDirSpy;

    await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalled();
    expect(mockIde.openFile).toHaveBeenCalled();
    expect(mockIde.saveFile).toHaveBeenCalled();
  });

  test("should throw error if file already exists", async () => {
    mockIde.fileExists.mockResolvedValue(true);

    const args = {
      filepath: "existing-file.txt",
      contents: "New content",
    };

    await expect(createNewFileImpl(args, mockExtras as any)).rejects.toThrow(
      ContinueError,
    );
  });

  test("should handle multi-level nested paths", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "sandbox/hello-charts/templates/deployment.yaml",
      contents: "apiVersion: apps/v1",
    };

    await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalled();
    const [filePath] = mockIde.writeFile.mock.calls[0];
    expect(filePath).toContain("deployment.yaml");
  });
});
```

---

## Testing Checklist

- [ ] Run new regression tests: `npm test -- core/tools/implementations/createNewFile.test.ts`
- [ ] Test in VS Code extension: Create file in non-existent nested path via chat
- [ ] Test in CLI: Run with agent creating files in nested paths
- [ ] Verify error message improvement for actual failures
- [ ] Test multi-root workspace scenario with prefixed paths

---

## Files to Modify

1. **`core/tools/implementations/createNewFile.ts`** - Add parent directory creation logic
2. **`core/tools/implementations/createNewFile.test.ts`** (create) - Add regression tests
3. **`core/util/errors.ts`** (if needed) - Add `DirectoryCreationFailed` error reason
4. **`core/tools/definitions/createNewFile.ts`** (optional) - Improve error documentation

---

## Impact Assessment

- **Risk Level:** Low - Only affects file creation flow
- **Breaking Changes:** None - Fix makes behavior match documented contract
- **Performance:** Negligible - Directory creation is one-time operation
- **Backwards Compatibility:** Fully compatible - only fixes broken behavior

---

## Related Issues

- Session transcript: `sandbox/chats-debug/20260511T103806_session.md`
- Error: `create_new_file failed with the message: 'filepath' argument is required and must not be empty or whitespace-only`
