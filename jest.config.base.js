const path = require('path');

/**
 * Shared Jest configuration for each workspace project.
 * Property tests run a minimum of 100 fast-check iterations (see jest.setup.js).
 * `dir` is the absolute path of the consuming workspace (its jest.config.js dir).
 */
module.exports = function createConfig(dir) {
  const repoRoot = path.resolve(__dirname);
  return {
    rootDir: dir,
    testEnvironment: 'node',
    transform: {
      '^.+\\.ts$': [
        'ts-jest',
        {
          tsconfig: {
            // Compile tests loosely of project references; standalone transpile.
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
      '^@iamfriendof/registration/(.*)$': path.join(repoRoot, 'services/registration/src/$1'),
      '^@iamfriendof/authentication$': path.join(repoRoot, 'services/authentication/src/index.ts'),
      '^@iamfriendof/authentication/(.*)$': path.join(repoRoot, 'services/authentication/src/$1'),
      '^@iamfriendof/profile$': path.join(repoRoot, 'services/profile/src/index.ts'),
      '^@iamfriendof/profile/(.*)$': path.join(repoRoot, 'services/profile/src/$1'),
      '^@iamfriendof/interest$': path.join(repoRoot, 'services/interest/src/index.ts'),
      '^@iamfriendof/interest/(.*)$': path.join(repoRoot, 'services/interest/src/$1'),
      '^@iamfriendof/media$': path.join(repoRoot, 'services/media/src/index.ts'),
      '^@iamfriendof/media/(.*)$': path.join(repoRoot, 'services/media/src/$1'),
      '^@iamfriendof/comment$': path.join(repoRoot, 'services/comment/src/index.ts'),
      '^@iamfriendof/comment/(.*)$': path.join(repoRoot, 'services/comment/src/$1'),
      '^@iamfriendof/event$': path.join(repoRoot, 'services/event/src/index.ts'),
      '^@iamfriendof/event/(.*)$': path.join(repoRoot, 'services/event/src/$1'),
      '^@iamfriendof/pm-rating$': path.join(repoRoot, 'services/pm-rating/src/index.ts'),
      '^@iamfriendof/pm-rating/(.*)$': path.join(repoRoot, 'services/pm-rating/src/$1'),
      '^@iamfriendof/notification$': path.join(repoRoot, 'services/notification/src/index.ts'),
      '^@iamfriendof/notification/(.*)$': path.join(repoRoot, 'services/notification/src/$1'),
      '^@iamfriendof/search$': path.join(repoRoot, 'services/search/src/index.ts'),
      '^@iamfriendof/search/(.*)$': path.join(repoRoot, 'services/search/src/$1'),
    },
    testMatch: ['**/*.test.ts', '**/*.spec.ts'],
    setupFilesAfterEnv: [path.join(repoRoot, 'jest.setup.js')],
    collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  };
};
