import { inferResolvedUriFromRelativePath } from "../../util/ideUtils";

import { ToolImpl } from ".";
import { throwIfFileIsSecurityConcernWithRules } from "../../indexing/ignore";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { getCleanUriPath, getUriPathBasename } from "../../util/uri";
import { getStringArg, sanitizeFilepath } from "../parseArgs";

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

  await throwIfFileIsSecurityConcernWithRules(
    getCleanUriPath(resolvedFileUri),
    extras.ide,
  );
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
