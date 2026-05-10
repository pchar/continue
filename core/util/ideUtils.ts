import { IDE } from "..";

import {
  joinEncodedUriPathSegmentToUri,
  joinPathsToUri,
  pathToUriPathSegment,
  getUriPathBasename,
} from "./uri";

/*
  This function takes a relative (to workspace) filepath
  And checks each workspace for if it exists or not
  Only returns fully resolved URI if it exists.

  Root-name priority: in a multi-root workspace, if the first path segment exactly matches
  a unique workspace root basename, that root is used — even if a same-named subdirectory
  exists inside another root.
*/
export async function resolveRelativePathInDir(
  path: string,
  ide: IDE,
  dirUriCandidates?: string[],
): Promise<string | undefined> {
  const dirs = dirUriCandidates ?? (await ide.getWorkspaceDirs());

  // In multi-root workspaces, give priority to root-name match over filesystem existence.
  if (dirs.length > 1) {
    const segments = path.split("/").filter(Boolean);
    const firstSegment = decodeURIComponent(segments[0] ?? "");
    if (firstSegment) {
      const matchingRoots = dirs.filter(
        (uri) => getUriPathBasename(uri) === firstSegment,
      );
      if (matchingRoots.length === 1) {
        const rootRelativePath = segments.slice(1).join("/");
        if (!rootRelativePath) {
          return matchingRoots[0];
        }
        const fullUri = joinPathsToUri(matchingRoots[0], rootRelativePath);
        if (await ide.fileExists(fullUri)) {
          return fullUri;
        }
        return undefined;
      }
    }
  }

  for (const dirUri of dirs) {
    const fullUri = joinPathsToUri(dirUri, path);
    if (await ide.fileExists(fullUri)) {
      return fullUri;
    }
  }

  return undefined;
}

/*
  Same as above but in this case the relative path does not need to exist (e.g. file to be created).

  Resolution priority:
  1. Root-name match: if first segment = a unique workspace root basename, resolve to that root.
  2. Duplicate root basename: throw ambiguity error immediately.
  3. Unique suffix match against existing paths across all roots.
  4. Active-file match (model outputs only the filename of the currently open file).
  5. Single root: resolve relative to it.
  6. Multi-root with no clear resolution: throw — never silently fall back to first root.
*/
export async function inferResolvedUriFromRelativePath(
  _relativePath: string,
  ide: IDE,
  dirCandidates?: string[],
): Promise<string> {
  const relativePath = _relativePath.trim().replaceAll("\\", "/");
  const dirs = dirCandidates ?? (await ide.getWorkspaceDirs());

  if (dirs.length === 0) {
    throw new Error("inferResolvedUriFromRelativePath: no dirs provided");
  }

  // Step 1: Root-name match.
  const segments = relativePath.split("/").filter(Boolean);
  const firstSegment = decodeURIComponent(segments[0] ?? "");
  const roots = dirs.map((uri) => ({ uri, name: getUriPathBasename(uri) }));
  const matchingRoots = roots.filter((root) => root.name === firstSegment);

  if (matchingRoots.length === 1) {
    const rootRelativePath = segments.slice(1).join("/");
    return rootRelativePath
      ? joinPathsToUri(matchingRoots[0].uri, rootRelativePath)
      : matchingRoots[0].uri;
  }

  if (matchingRoots.length > 1) {
    throw new Error(
      `Ambiguous workspace root name "${firstSegment}": more than one open root has that basename. ` +
        `Use an absolute path or the full workspace root path.`,
    );
  }

  // Step 2: Unique suffix match against existing files/dirs.
  const encodedSegments = pathToUriPathSegment(relativePath).split("/");
  const suffixes: string[] = [];
  for (let i = encodedSegments.length - 1; i >= 0; i--) {
    suffixes.push(encodedSegments.slice(i).join("/"));
  }

  for (const suffix of suffixes) {
    const uris = dirs.map((dir) => ({
      dir,
      partialUri: joinEncodedUriPathSegmentToUri(dir, suffix),
    }));
    const existenceChecks = await Promise.all(
      uris.map(async ({ partialUri, dir }) => ({
        dir,
        partialUri,
        exists: await ide.fileExists(partialUri),
      })),
    );
    const existingUris = existenceChecks.filter(({ exists }) => exists);
    if (existingUris.length === 1) {
      return joinEncodedUriPathSegmentToUri(
        existingUris[0].dir,
        encodedSegments.join("/"),
      );
    }
  }

  // Step 3: Active-file match.
  const activeFile = await ide.getCurrentFile();
  if (activeFile && activeFile.path.endsWith(relativePath)) {
    return activeFile.path;
  }

  // Step 4: Single root — safe to resolve.
  if (dirs.length === 1) {
    return joinPathsToUri(dirs[0], relativePath);
  }

  // Step 5: Multi-root, ambiguous — refuse instead of silently guessing.
  const firstSegment2 = segments[0] ?? "";
  const hint =
    roots.length > 0
      ? `Use one of: ${roots.map((r) => `"${r.name}/${relativePath}"`).join(", ")}`
      : "Use an absolute path.";
  throw new Error(
    `Cannot create "${relativePath}": "${firstSegment2}" is not a workspace root name.\n` +
      `Workspace roots: ${roots.map((r) => r.name).join(", ")}.\n` +
      hint,
  );
}
