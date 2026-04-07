// Ambient declaration so `tsc -p tsconfig.lib.json` accepts CSS side-effect
// imports. Vite resolves these at bundle time; this file only satisfies the
// TypeScript compiler during the declaration-emit pass.
declare module "*.css" {
  const _: Record<string, string>;
  export default _;
}
