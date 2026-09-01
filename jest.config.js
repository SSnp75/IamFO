/**
 * Root Jest config. Uses "projects" so each workspace runs with its own
 * ts-jest configuration when `jest` is invoked from the repo root.
 */
module.exports = {
  projects: [
    '<rootDir>/packages/shared',
    '<rootDir>/services/registration',
    '<rootDir>/services/authentication',
    '<rootDir>/services/profile',
    '<rootDir>/services/interest',
    '<rootDir>/services/media',
    '<rootDir>/services/comment',
    '<rootDir>/services/event',
    '<rootDir>/services/pm-rating',
    '<rootDir>/services/notification',
    '<rootDir>/services/search',
    '<rootDir>/apps/web',
  ],
};
