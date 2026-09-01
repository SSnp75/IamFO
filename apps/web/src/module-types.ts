import type { Db, MessageBus, JwtSessions } from '@iamfriendof/shared';
import type { AppConfig } from './config';
import type { Router } from './http/router';

/**
 * Dependencies handed to every module at registration time.
 *
 * In Phase 0 all modules share one process, one database connection, and one
 * in-process bus. Because a module only receives these abstractions (never
 * another module's internals), it can be lifted into a standalone service in
 * Phase 1/2 by giving it its own bus/db connection — no code change to its
 * routes or logic (Requirement 15.6).
 */
export interface ModuleDeps {
  config: AppConfig;
  bus: MessageBus;
  db: Db;
  sessions: JwtSessions;
}

/**
 * A domain module (Registration, Authentication, Profile, ...). Each module
 * mounts its own routes onto the shared router. The set of modules registered
 * here equals the set of target services in the design.
 */
export interface AppModule {
  readonly name: string;
  register(router: Router, deps: ModuleDeps): void;
}
