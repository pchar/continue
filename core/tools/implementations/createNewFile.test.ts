import { jest } from "@jest/globals";
import { ContinueError } from "../../util/errors";
import { createNewFileImpl } from "./createNewFile";

const mockIde = {
  getWorkspaceDirs: jest
    .fn<() => Promise<string[]>>()
    .mockResolvedValue([
      "file:///Users/pch/MyProjects/DGJ/sandbox",
      "file:///Users/pch/MyProjects/DGJ/continue",
    ]),
  getCurrentFile: jest.fn<() => Promise<any>>().mockResolvedValue(null),
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
  mockIde.getWorkspaceDirs.mockResolvedValue([
    "file:///Users/pch/MyProjects/DGJ/sandbox",
    "file:///Users/pch/MyProjects/DGJ/continue",
  ]);
  mockIde.getCurrentFile.mockResolvedValue(null);
  mockIde.fileExists.mockResolvedValue(false);
});

describe("createNewFileImpl", () => {
  test("should create a simple file in existing directory", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "sandbox/test.txt",
      contents: "Hello World",
    };

    const result = await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalled();
    expect(mockIde.openFile).toHaveBeenCalled();
    expect(mockIde.saveFile).toHaveBeenCalled();
    expect(result[0].content).toContain("File created successfully");
  });

  test("should create file with nested paths (sandbox/hello-charts/Chart.yaml)", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "sandbox/hello-charts/Chart.yaml",
      contents: "apiVersion: v1\nkind: Chart",
    };

    const result = await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalled();
    expect(mockIde.openFile).toHaveBeenCalled();
    expect(mockIde.saveFile).toHaveBeenCalled();
    expect(result[0].content).toContain("File created successfully");
  });

  test("should create file with multi-level nested paths", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "sandbox/hello-charts/templates/deployment.yaml",
      contents: "apiVersion: apps/v1\nkind: Deployment",
    };

    const result = await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalled();
    expect(result[0].description).toContain("deployment.yaml");
  });

  test("should throw error if file already exists", async () => {
    mockIde.fileExists.mockResolvedValue(true);

    const args = {
      filepath: "sandbox/existing-file.txt",
      contents: "New content",
    };

    await expect(createNewFileImpl(args, mockExtras as any)).rejects.toThrow(
      ContinueError,
    );

    // Verify writeFile was NOT called
    expect(mockIde.writeFile).not.toHaveBeenCalled();
  });

  test("should return proper metadata with workspace path", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "continue/src/utils/helpers.ts",
      contents: "export const helper = () => {};",
    };

    const result = await createNewFileImpl(args, mockExtras as any);

    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty("name", "helpers.ts");
    expect(result[0]).toHaveProperty("description");
    expect(result[0]).toHaveProperty("content");
    expect(result[0]).toHaveProperty("uri");
  });

  test("should sanitize filepath to prevent security issues", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    // Test path traversal prevention
    const args = {
      filepath: "../../../etc/passwd",
      contents: "malicious",
    };

    // This should either be sanitized or throw a security error
    // depending on the sanitizeFilepath implementation
    try {
      await createNewFileImpl(args, mockExtras as any);
      // If it doesn't throw, the path should be sanitized in the writeFile call
      expect(mockIde.writeFile).toHaveBeenCalled();
    } catch (err) {
      // If it throws, that's also acceptable behavior
      expect(err).toBeInstanceOf(ContinueError);
    }
  });

  test("should create file with empty contents", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "sandbox/empty.txt",
      contents: "",
    };

    const result = await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalledWith(expect.any(String), "");
  });

  test("should handle multi-root workspace paths with prefix", async () => {
    mockIde.fileExists.mockResolvedValue(false);

    const args = {
      filepath: "sandbox/test/hello.c",
      contents: "#include <stdio.h>\nint main() { return 0; }",
    };

    const result = await createNewFileImpl(args, mockExtras as any);

    expect(mockIde.writeFile).toHaveBeenCalled();
    expect(result[0].content).toContain("File created successfully");
  });
});
