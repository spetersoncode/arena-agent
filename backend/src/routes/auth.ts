import { Hono } from "hono";
import { auth } from "../auth.js";

/**
 * Better Auth handler — passes all /api/auth/* requests to Better Auth.
 */
const authRoutes = new Hono().on(["POST", "GET"], "/**", (c) => {
	return auth.handler(c.req.raw);
});

export { authRoutes };
