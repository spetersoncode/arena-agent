import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [tailwindcss(), react()],
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
			"@arena/backend": resolve(__dirname, "../backend/src"),
		},
	},
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:3000",
				changeOrigin: true,
				// Disable buffering for SSE streams
				configure: (proxy) => {
					proxy.on("proxyRes", (proxyRes) => {
						if (proxyRes.headers["content-type"]?.includes("text/event-stream")) {
							proxyRes.headers["cache-control"] = "no-cache";
							proxyRes.headers["x-accel-buffering"] = "no";
						}
					});
				},
			},
		},
	},
});
