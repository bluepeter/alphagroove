import { register } from 'node:module';
import { pathToFileURL } from 'node:url';

// Register our local ESM loader without using --experimental-loader
register('./scripts/esm-loader.mjs', pathToFileURL('./'));
