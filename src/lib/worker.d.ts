// Ambient declaration so `tsc -p tsconfig.lib.json` accepts Vite ?worker&inline
// imports. Vite compiles and inlines the worker at bundle time; this file only
// satisfies the TypeScript compiler during the declaration-emit pass.
declare module "*?worker&inline" {
  const ctor: new () => Worker;
  export default ctor;
}
