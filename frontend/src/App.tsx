import { QueryClientProvider } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-client";
import { queryClient } from "@/lib/query";
import { AdminPage } from "@/pages/admin";
import { ArenaPage } from "@/pages/arena";
import { HomePage } from "@/pages/home";
import { LoginPage } from "@/pages/login";

function Router() {
	const { data: session, isPending } = useSession();

	if (isPending) {
		return (
			<div className="flex min-h-screen items-center justify-center">
				<p className="text-muted-foreground animate-pulse">Loading...</p>
			</div>
		);
	}

	if (!session?.user) {
		return <LoginPage />;
	}

	// Simple path-based routing
	const path = window.location.pathname;

	if (path.startsWith("/arena/")) {
		const arenaId = path.split("/arena/")[1];
		return <ArenaPage arenaId={arenaId} />;
	}

	if (path === "/admin") {
		const role = (session.user as { role?: string }).role;
		if (role !== "admin") {
			return <HomePage />;
		}
		return <AdminPage />;
	}

	return <HomePage />;
}

export default function App() {
	return (
		<QueryClientProvider client={queryClient}>
			<Router />
		</QueryClientProvider>
	);
}
