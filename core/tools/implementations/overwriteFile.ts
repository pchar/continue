import { ToolImpl } from ".";
import { throwIfFileIsSecurityConcernWithRules } from "../../indexing/ignore";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { inferResolvedUriFromRelativePath } from "../../util/ideUtils";
import { getCleanUriPath, getUriPathBasename } from "../../util/uri";
import { getStringArg, sanitizeFilepath } from "../parseArgs";

export const overwriteFileImpl: ToolImpl = async (args, extras) => {
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

  const existed = await extras.ide.fileExists(resolvedFileUri);
  await extras.ide.writeFile(resolvedFileUri, contents);
  await extras.ide.openFile(resolvedFileUri);
  await extras.ide.saveFile(resolvedFileUri);
  if (extras.codeBaseIndexer) {
    void extras.codeBaseIndexer?.refreshCodebaseIndexFiles([resolvedFileUri]);
  }

  const action = existed ? "overwritten" : "created";
  return [
    {
      name: getUriPathBasename(resolvedFileUri),
      description: getCleanUriPath(resolvedFileUri),
      content: [
        `File ${action} successfully.`,
        `Workspace path: "${filepath}"`,
        `Use exactly this filepath for all subsequent tool calls on this file: read_file, overwrite_file, single_find_and_replace.`,
      ].join("\n"),
      uri: {
        type: "file",
        value: resolvedFileUri,
      },
    },
  ];
};
