import { registrationModule } from './modules/registration';
import { authenticationModule } from './modules/authentication';
import { profileModule } from './modules/profile';
import { interestModule } from './modules/interest';
import { mediaModule } from './modules/media';
import { commentModule } from './modules/comment';
import { eventModule } from './modules/event';
import { pmRatingModule } from './modules/pm-rating';
import { notificationModule } from './modules/notification';
import { searchModule } from './modules/search';
import type { AppModule } from './module-types';

export type { AppModule, ModuleDeps } from './module-types';

/**
 * The ordered list of Phase 0 modules. Domain modules are added as their tasks
 * (4–17) are implemented; each import stays a self-contained module directory
 * so extraction later is mechanical. This set equals the target services.
 */
export function createModules(): AppModule[] {
  return [
    registrationModule,
    authenticationModule,
    profileModule,
    interestModule,
    mediaModule,
    commentModule,
    eventModule,
    pmRatingModule,
    notificationModule,
    searchModule,
  ];
}
