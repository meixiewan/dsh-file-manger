/**
 * Host half of the workspace file manager.
 *
 * The plugin owns three exact Fetch routes. Every route resolves the live
 * Session named by the browser and confines all work to that Session's
 * workspace root — the immutable project directory in its header, which is
 * also the Session's `workspace-write` boundary.
 */
import { DEFAULT_LIMITS } from './lib/ops.js';
import { registerRoutes } from './lib/routes.js';

/** Host services required by the routes. */
export const inject = ['connection', 'sessions', 'workingDirectory'];

/**
 * Register the manager's exact Fetch routes for this Host's lifetime.
 * @param {object} ctx - Host plugin context.
 */
export function apply(ctx) {
  registerRoutes(ctx, {
    sessions: ctx.sessions,
    workingDirectory: ctx.workingDirectory,
    limits: DEFAULT_LIMITS,
    logger: ctx.logger,
  });
}
