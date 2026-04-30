/**
 * Bun preload — virtualizes `bun:bundle` so non-built source can run.
 * Build pipeline strips the import; here we just stub feature() to false.
 */
Bun.plugin({
  name: 'bun-bundle-shim',
  setup(build) {
    build.onResolve({ filter: /^(bun:bundle|bundle)$/ }, () => ({
      path: 'bun-bundle-shim',
      namespace: 'bun-bundle-shim',
    }))
    build.onLoad({ filter: /.*/, namespace: 'bun-bundle-shim' }, () => ({
      contents: 'export const feature = (_name) => false;',
      loader: 'js',
    }))
  },
})
