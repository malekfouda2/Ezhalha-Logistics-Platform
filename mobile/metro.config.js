// Metro lives in mobile/ but must resolve `@shared/*` out of the repo root, so the
// mobile app and the web app share one copy of the Drizzle/Zod types in shared/.
//
// Two things are required for that to work:
//   watchFolders     — lets Metro read files outside mobile/ (and hot-reload them)
//   extraNodeModules — maps the @shared alias to the real directory
//
// Keep this in sync with the `paths` entry in tsconfig.json: TypeScript resolves the
// alias at type-check time, Metro resolves it at bundle time, and they must agree.

const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [path.resolve(repoRoot, "shared")];

config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  "@shared": path.resolve(repoRoot, "shared"),
};

// mobile/ keeps its own node_modules; the root install is for the web app and API.
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, "node_modules")];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
