// Minimal ESM loader to resolve extensionless relative imports by appending .js
// Only affects bare relative specifiers (./ or ../) that lack an extension

import { resolve as resolvePath } from 'node:path';
import { pathToFileURL } from 'node:url';

const hasKnownJsExt = s => s.endsWith('.js') || s.endsWith('.mjs') || s.endsWith('.cjs');

export async function resolve(specifier, context, nextResolve) {
  // Handle relative specifiers that don't already have a JS extension
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !hasKnownJsExt(specifier)) {
    try {
      const withJs = `${specifier}.js`;
      return await nextResolve(withJs, context);
    } catch {
      // fallthrough to default
    }
  }
  return nextResolve(specifier, context);
}
