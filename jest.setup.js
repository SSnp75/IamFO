// Enforce a minimum of 100 iterations for every fast-check property test.
const fc = require('fast-check');
fc.configureGlobal({ numRuns: 100 });
