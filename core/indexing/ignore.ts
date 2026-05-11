import ignore from "ignore";
import * as YAML from "yaml";

import path from "path";
import { fileURLToPath } from "url";
import type { IDE } from "..";
import { ContinueError, ContinueErrorReason } from "../util/errors";

export const SECURITY_RULES_RELATIVE_PATH = ".continue/rules/security-rule.md";

export interface SecurityConcernConfig {
  enabled?: boolean;
  allowPaths?: string[];
  denyPaths?: string[];
}

// Security-focused ignore patterns - these should always be excluded for security reasons
export const DEFAULT_SECURITY_IGNORE_FILETYPES = [
  // Environment and configuration files with secrets
  "*.env",
  "*.env.*",
  ".env*",
  "config.json",
  "config.yaml",
  "config.yml",
  "settings.json",
  "appsettings.json",
  "appsettings.*.json",

  // Certificate and key files
  "*.key",
  "*.pem",
  "*.p12",
  "*.pfx",
  "*.crt",
  "*.cer",
  "*.jks",
  "*.keystore",
  "*.truststore",

  // Database files that may contain sensitive data
  "*.db",
  "*.sqlite",
  "*.sqlite3",
  "*.mdb",
  "*.accdb",

  // Credential and secret files
  "*.secret",
  "*.secrets",
  "auth.json",
  "*.token",

  // Backup files that might contain sensitive data
  "*.bak",
  "*.backup",
  "*.old",
  "*.orig",

  // Docker secrets
  "docker-compose.override.yml",
  "docker-compose.override.yaml",

  // SSH and GPG
  "id_rsa",
  "id_dsa",
  "id_ecdsa",
  "id_ed25519",
  "*.ppk",
  "*.gpg",
];

export const DEFAULT_SECURITY_IGNORE_DIRS = [
  // Environment and configuration directories
  ".env/",
  "env/",

  // Cloud provider credential directories
  ".aws/",
  ".gcp/",
  ".azure/",
  ".kube/",
  ".docker/",

  // Secret directories
  "secrets/",
  ".secrets/",
  "private/",
  ".private/",
  "certs/",
  "certificates/",
  "keys/",
  ".ssh/",
  ".gnupg/",
  ".gpg/",

  // Temporary directories that might contain sensitive data
  "tmp/secrets/",
  "temp/secrets/",
  ".tmp/",
];

// Additional non-security patterns for general indexing exclusion
export const ADDITIONAL_INDEXING_IGNORE_FILETYPES = [
  "*.DS_Store",
  "*-lock.json",
  "*.lock",
  "*.log",
  "*.ttf",
  "*.png",
  "*.jpg",
  "*.jpeg",
  "*.gif",
  "*.mp4",
  "*.svg",
  "*.ico",
  "*.pdf",
  "*.zip",
  "*.gz",
  "*.tar",
  "*.dmg",
  "*.tgz",
  "*.rar",
  "*.7z",
  "*.exe",
  "*.dll",
  "*.obj",
  "*.o",
  "*.o.d",
  "*.a",
  "*.lib",
  "*.so",
  "*.dylib",
  "*.ncb",
  "*.sdf",
  "*.woff",
  "*.woff2",
  "*.eot",
  "*.cur",
  "*.avi",
  "*.mpg",
  "*.mpeg",
  "*.mov",
  "*.mp3",
  "*.mkv",
  "*.webm",
  "*.jar",
  "*.onnx",
  "*.parquet",
  "*.pqt",
  "*.wav",
  "*.webp",
  "*.wasm",
  "*.plist",
  "*.profraw",
  "*.gcda",
  "*.gcno",
  "go.sum",
  "*.gitignore",
  "*.gitkeep",
  "*.continueignore",
  "*.csv",
  "*.uasset",
  "*.pdb",
  "*.bin",
  "*.pag",
  "*.swp",
  "*.jsonl",
  // "*.prompt", // can be incredibly confusing for the LLM to have another set of instructions injected into the prompt
  // Application specific
  ".continue/",
];

export const ADDITIONAL_INDEXING_IGNORE_DIRS = [
  ".git/",
  ".svn/",
  "node_modules/",
  "dist/",
  "build/",
  "Build/",
  "target/",
  "out/",
  "bin/",
  ".pytest_cache/",
  ".vscode-test/",
  "__pycache__/",
  "site-packages/",
  ".gradle/",
  ".mvn/",
  ".cache/",
  "gems/",
  "vendor/",

  ".venv/",
  "venv/",

  ".vscode/",
  ".idea/",
  ".vs/",
];

// Combined patterns: security + additional
export const DEFAULT_IGNORE_FILETYPES = [
  ...DEFAULT_SECURITY_IGNORE_FILETYPES,
  ...ADDITIONAL_INDEXING_IGNORE_FILETYPES,
];

export const DEFAULT_IGNORE_DIRS = [
  ...DEFAULT_SECURITY_IGNORE_DIRS,
  ...ADDITIONAL_INDEXING_IGNORE_DIRS,
];

export const DEFAULT_IGNORES = [
  ...DEFAULT_IGNORE_FILETYPES,
  ...DEFAULT_IGNORE_DIRS,
];

export const defaultIgnoresGlob = `!{${DEFAULT_IGNORES.join(",")}}`;

// Create ignore instances
export const defaultSecurityIgnoreFile = ignore().add(
  DEFAULT_SECURITY_IGNORE_FILETYPES,
);
export const defaultSecurityIgnoreDir = ignore().add(
  DEFAULT_SECURITY_IGNORE_DIRS,
);
export const defaultIgnoreFile = ignore().add(DEFAULT_IGNORE_FILETYPES);
export const defaultIgnoreDir = ignore().add(DEFAULT_IGNORE_DIRS);

// String representations
export const DEFAULT_SECURITY_IGNORE =
  DEFAULT_SECURITY_IGNORE_FILETYPES.join("\n") +
  "\n" +
  DEFAULT_SECURITY_IGNORE_DIRS.join("\n");

export const DEFAULT_IGNORE =
  DEFAULT_IGNORE_FILETYPES.join("\n") + "\n" + DEFAULT_IGNORE_DIRS.join("\n");

// Combined ignore instances
export const defaultFileAndFolderSecurityIgnores = ignore()
  .add(defaultSecurityIgnoreFile)
  .add(defaultSecurityIgnoreDir);

export const defaultIgnoreFileAndDir = ignore()
  .add(defaultIgnoreFile)
  .add(defaultIgnoreDir);

function normalizeUriOrPath(filePathOrUri: string): string {
  let filepath = filePathOrUri;
  try {
    filepath = fileURLToPath(filePathOrUri);
  } catch {}
  return filepath;
}

function getDefaultSecurityCheckPath(filePathOrUri: string): string {
  const filepath = normalizeUriOrPath(filePathOrUri);
  if (path.isAbsolute(filepath)) {
    const dir = path.dirname(filepath).split(/\/|\\/).at(-1) ?? "";
    const basename = path.basename(filepath);
    return `${dir ? dir + "/" : ""}${basename}`;
  }
  return filepath;
}

function getSecurityMatchCandidates(filePathOrUri: string): string[] {
  const filepath = normalizeUriOrPath(filePathOrUri);
  const normalized = filepath.replace(/\\/g, "/");
  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>([normalized]);
  const basename = path.basename(normalized);
  if (basename) {
    candidates.add(basename);
  }

  if (path.isAbsolute(filepath)) {
    const rel = getDefaultSecurityCheckPath(filepath);
    if (rel) {
      candidates.add(rel);
    }
  }

  return Array.from(candidates);
}

function dedupePatterns(patterns: string[]): string[] {
  const unique = new Set(
    patterns
      .map((p) => p?.trim())
      .filter((p): p is string => typeof p === "string" && p.length > 0),
  );
  return Array.from(unique);
}

function parsePatternList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return dedupePatterns(
      value.filter((v): v is string => typeof v === "string"),
    );
  }
  if (typeof value === "string") {
    return dedupePatterns(value.split(/\r?\n|,/));
  }
  return [];
}

function parseSecurityConcernConfig(content: string): SecurityConcernConfig {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!frontmatterMatch) {
    return {};
  }

  const parsed = YAML.parse(frontmatterMatch[1]);
  if (!parsed || typeof parsed !== "object") {
    return {};
  }

  const source =
    typeof (parsed as any).securityConcern === "object" &&
    (parsed as any).securityConcern !== null
      ? (parsed as any).securityConcern
      : parsed;

  const enabled =
    typeof (source as any).enabled === "boolean"
      ? (source as any).enabled
      : undefined;

  const allowPaths = parsePatternList(
    (source as any).allowPaths ??
      (source as any).allow ??
      (source as any).allowlist,
  );

  const denyPaths = parsePatternList(
    (source as any).denyPaths ??
      (source as any).deny ??
      (source as any).denylist,
  );

  return {
    enabled,
    allowPaths,
    denyPaths,
  };
}

function mergeSecurityConcernConfig(
  base: SecurityConcernConfig,
  next: SecurityConcernConfig,
): SecurityConcernConfig {
  return {
    enabled: next.enabled ?? base.enabled,
    allowPaths: dedupePatterns([
      ...(base.allowPaths ?? []),
      ...(next.allowPaths ?? []),
    ]),
    denyPaths: dedupePatterns([
      ...(base.denyPaths ?? []),
      ...(next.denyPaths ?? []),
    ]),
  };
}

function matchesAnyPattern(
  filePathOrUri: string,
  patterns: string[] | undefined,
): boolean {
  if (!patterns?.length) {
    return false;
  }

  const matcher = ignore().add(patterns);
  return getSecurityMatchCandidates(filePathOrUri).some((candidate) =>
    matcher.ignores(candidate),
  );
}

function getWorkspaceRulesFileUri(workspaceDirUriOrPath: string): string {
  if (workspaceDirUriOrPath.startsWith("file://")) {
    const base = workspaceDirUriOrPath.endsWith("/")
      ? workspaceDirUriOrPath
      : `${workspaceDirUriOrPath}/`;
    return new URL(SECURITY_RULES_RELATIVE_PATH, base).toString();
  }
  return path.join(workspaceDirUriOrPath, SECURITY_RULES_RELATIVE_PATH);
}

export async function loadSecurityConcernConfigFromRules(
  ide: IDE,
): Promise<SecurityConcernConfig> {
  const workspaceDirs = await ide.getWorkspaceDirs();
  let config: SecurityConcernConfig = {
    enabled: true,
    allowPaths: [],
    denyPaths: [],
  };

  for (const workspaceDir of workspaceDirs) {
    const rulesFileUri = getWorkspaceRulesFileUri(workspaceDir);
    try {
      const content = await ide.readFile(rulesFileUri);
      const parsed = parseSecurityConcernConfig(content);
      config = mergeSecurityConcernConfig(config, parsed);
    } catch {
      // Rules file is optional per workspace.
    }
  }

  return config;
}

export function isSecurityConcern(
  filePathOrUri: string,
  config?: SecurityConcernConfig,
) {
  if (!filePathOrUri) {
    return false;
  }

  if (config?.enabled === false) {
    return false;
  }

  if (matchesAnyPattern(filePathOrUri, config?.allowPaths)) {
    return false;
  }

  const filepath = getDefaultSecurityCheckPath(filePathOrUri);
  if (!filepath) {
    return false;
  }

  if (defaultFileAndFolderSecurityIgnores.ignores(filepath)) {
    return true;
  }

  return matchesAnyPattern(filePathOrUri, config?.denyPaths);
}

export function throwIfFileIsSecurityConcern(
  filepath: string,
  config?: SecurityConcernConfig,
) {
  if (isSecurityConcern(filepath, config)) {
    throw new ContinueError(
      ContinueErrorReason.FileIsSecurityConcern,
      `Reading or Editing ${filepath} is not allowed because it is a security concern. Do not attempt to read or edit this file in any way.`,
    );
  }
}

export async function throwIfFileIsSecurityConcernWithRules(
  filepath: string,
  ide: IDE,
) {
  const config = await loadSecurityConcernConfigFromRules(ide);
  throwIfFileIsSecurityConcern(filepath, config);
}

export function gitIgArrayFromFile(file: string) {
  return file
    .split(/\r?\n/) // Split on new line
    .map((l) => l.trim()) // Remove whitespace
    .filter((l) => !/^#|^$/.test(l)); // Remove empty lines
}
