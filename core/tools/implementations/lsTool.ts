import ignore from "ignore";

import { ToolImpl } from ".";
import { walkDir } from "../../indexing/walkDir";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { resolveInputPath } from "../../util/pathResolver";
import { getUriPathBasename } from "../../util/uri";

export function resolveLsToolDirPath(dirPath: string | undefined) {
  if (!dirPath || dirPath === ".") {
    return ".";
  }
  return dirPath.replace(/\\/g, "/");
}

const MAX_LS_TOOL_LINES = 200;

export const lsToolImpl: ToolImpl = async (args, extras) => {
  const dirPath = resolveLsToolDirPath(args?.dirPath);

  // In a multi-root workspace, "." lists workspace root names as top-level directories.
  // Format matches a normal ls entry (trailing slash = directory) so the model understands
  // these names are the correct first segment for any path (e.g. sandbox/test/hello.c).
  if (dirPath === ".") {
    const workspaceDirs = await extras.ide.getWorkspaceDirs();
    if (workspaceDirs.length > 1) {
      const rootLines = workspaceDirs.map(
        (uri) => `${getUriPathBasename(uri)}/`,
      );
      return [
        {
          name: "File/folder list",
          description:
            "Multi-root workspace roots — prefix any path with the root name (e.g. sandbox/test/hello.c)",
          content: rootLines.join("\n"),
        },
      ];
    }
  }

  const resolvedPath = await resolveInputPath(extras.ide, dirPath);
  if (!resolvedPath) {
    throw new ContinueError(
      ContinueErrorReason.DirectoryNotFound,
      `Directory ${args.dirPath} not found or is not accessible. You can use absolute paths, relative paths, or paths starting with ~`,
    );
  }

  const entries = await walkDir(resolvedPath.uri, extras.ide, {
    returnRelativeUrisPaths: true,
    include: "both",
    recursive: args?.recursive ?? false,
    overrideDefaultIgnores: ignore(), // Show all directories including dist/, build/, etc.
  });

  const lines = entries.slice(0, MAX_LS_TOOL_LINES);

  let content =
    lines.length > 0
      ? lines.join("\n")
      : `No files/folders found in ${resolvedPath.displayPath}`;

  const contextItems = [
    {
      name: "File/folder list",
      description: `Files/folders in ${resolvedPath.displayPath}`,
      content,
    },
  ];

  if (entries.length > MAX_LS_TOOL_LINES) {
    let warningContent = `${entries.length - MAX_LS_TOOL_LINES} ls entries were truncated`;
    if (args?.recursive) {
      warningContent += ". Try using a non-recursive search";
    }
    contextItems.push({
      name: "Truncation warning",
      description: "",
      content: warningContent,
    });
  }

  return contextItems;
};
