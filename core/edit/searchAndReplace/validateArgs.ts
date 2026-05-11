import { IDE } from "../..";
import { ContinueError, ContinueErrorReason } from "../../util/errors";
import { resolveRelativePathInDir } from "../../util/ideUtils";
import { sanitizeFilepath } from "../../tools/parseArgs";

export async function validateSearchAndReplaceFilepath(
  filepath: unknown,
  ide: IDE,
) {
  if (!filepath || typeof filepath !== "string") {
    throw new ContinueError(
      ContinueErrorReason.FindAndReplaceMissingFilepath,
      "filepath (string) is required",
    );
  }
  const resolvedFilepath = await resolveRelativePathInDir(
    sanitizeFilepath(filepath),
    ide,
  );
  if (!resolvedFilepath) {
    throw new ContinueError(
      ContinueErrorReason.FileNotFound,
      `File "${filepath}" could not be found in the workspace.\n` +
        `If the file exists on disk but was just created, use overwrite_file with the same filepath instead.\n` +
        `Do NOT use terminal commands to work around this error.`,
    );
  }
  return resolvedFilepath;
}
