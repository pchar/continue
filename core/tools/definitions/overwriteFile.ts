import { Tool } from "../..";
import { BUILT_IN_GROUP_NAME, BuiltInToolNames } from "../builtIn";

export const overwriteFileTool: Tool = {
  type: "function",
  displayTitle: "Overwrite File",
  wouldLikeTo: "overwrite {{{ filepath }}}",
  isCurrently: "overwriting {{{ filepath }}}",
  hasAlready: "overwritten {{{ filepath }}}",
  group: BUILT_IN_GROUP_NAME,
  readonly: false,
  isInstant: true,
  function: {
    name: BuiltInToolNames.OverwriteFile,
    description: `Replace the entire contents of an existing file with new content. Use this when you need to rewrite a file from scratch — for example when a previous edit attempt failed or the file content is badly structured. The file must already exist; use ${BuiltInToolNames.CreateNewFile} for new files. In a multi-root workspace, prefix the path with the target workspace root name (e.g. sandbox/test/Makefile).`,
    parameters: {
      type: "object",
      required: ["filepath", "contents"],
      properties: {
        filepath: {
          type: "string",
          description:
            "Path to the existing file to overwrite, prefixed with the workspace root name in a multi-root workspace (e.g. sandbox/test/Makefile).",
        },
        contents: {
          type: "string",
          description:
            "The complete new file contents (replaces everything currently in the file).",
        },
      },
    },
  },
  defaultToolPolicy: "allowedWithPermission",
  systemMessageDescription: {
    prefix: `To replace the ENTIRE contents of an existing file, use the ${BuiltInToolNames.OverwriteFile} tool. Use this when ${BuiltInToolNames.SingleFindAndReplace} or ${BuiltInToolNames.EditExistingFile} fails, or when you want to rewrite the whole file. For example:`,
    exampleArgs: [
      ["filepath", "sandbox/test/Makefile"],
      [
        "contents",
        "CC = gcc\nCFLAGS = -Wall -Wextra\n\nall: hello\n\nhello: hello.c\n\t$(CC) $(CFLAGS) -o hello hello.c\n\nclean:\n\trm -f hello\n\n.PHONY: all clean",
      ],
    ],
  },
};
