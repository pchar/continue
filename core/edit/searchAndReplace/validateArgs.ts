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
      `File ${filepath} does not exist`,
    );
  }
  return resolvedFilepath;
}
