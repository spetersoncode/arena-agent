import { createMiddleware } from "hono/factory";
import { auth, type Session } from "./auth.js";
import type { Role } from "./schemas/index.js";

// ── Extend Hono context with auth ──
type AuthEnv = {
	Variables: {
		user: Session["user"];
		session: Session["session"];
	};
};

/**
 * Middleware that requires authentication.
 * Populates c.get("user") and c.get("session").
 */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
	const session = await auth.api.getSession({
		headers: c.req.raw.headers,
	});

	if (!session) {
		return c.json({ success: false, error: "Unauthorized" }, 401);
	}

	c.set("user", session.user);
	c.set("session", session.session);
	await next();
});

/**
 * Middleware that requires a specific role (or higher).
 * Must be used after requireAuth.
 */
const roleHierarchy: Record<Role, number> = {
	spectator: 0,
	player: 1,
	admin: 2,
};

export function requireRole(minimumRole: Role) {
	return createMiddleware<AuthEnv>(async (c, next) => {
		const user = c.get("user");
		const userRole = (user as { role?: Role }).role ?? "spectator";
		const userLevel = roleHierarchy[userRole] ?? 0;
		const requiredLevel = roleHierarchy[minimumRole];

		if (userLevel < requiredLevel) {
			return c.json(
				{
					success: false,
					error: `Requires ${minimumRole} role or higher`,
				},
				403,
			);
		}

		await next();
	});
}
