// Re-create the starter catalogue. --reset wipes ALL orders, quotes and products first.
import { seedIfEmpty } from '../lib/seed.mjs';
const reset = process.argv.includes('--reset');
console.log(seedIfEmpty({ reset }) ? 'Catalogue seeded.' : 'Catalogue already exists (use --reset to wipe and re-seed).');
