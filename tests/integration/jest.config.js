const path = require('path');
const repoRoot = path.resolve(__dirname, '../..');

/** Integration tests run against a real Postgres. Longer timeout, own project. */
module.exports = {
  displayName: 'integration',
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['**/*.itest.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'node',
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
          resolveJsonModule: true,
          isolatedModules: true,
        },
      },
    ],
  },
  moduleNameMapper: {
    '^@iamfriendof/shared$': path.join(repoRoot, 'packages/shared/src/index.ts'),
    '^@iamfriendof/shared/(.*)$': path.join(repoRoot, 'packages/shared/src/$1'),
    '^@iamfriendof/registration$': path.join(repoRoot, 'services/registration/src/index.ts'),
    '^@iamfriendof/authentication$': path.join(repoRoot, 'services/authentication/src/index.ts'),
    '^@iamfriendof/profile$': path.join(repoRoot, 'services/profile/src/index.ts'),
    '^@iamfriendof/interest$': path.join(repoRoot, 'services/interest/src/index.ts'),
    '^@iamfriendof/event$': path.join(repoRoot, 'services/event/src/index.ts'),
    '^@iamfriendof/pm-rating$': path.join(repoRoot, 'services/pm-rating/src/index.ts'),
    '^@iamfriendof/notification$': path.join(repoRoot, 'services/notification/src/index.ts'),
    '^@iamfriendof/search$': path.join(repoRoot, 'services/search/src/index.ts'),
  },
  testTimeout: 30000,
  // Integration tests share one database and each resets the schema in beforeAll;
  // run them serially so parallel workers do not drop each other's tables.
  maxWorkers: 1,
};
