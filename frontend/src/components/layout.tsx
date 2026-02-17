import { LogOut, Shield, Swords, Users } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut, useSession } from "@/lib/auth-client";

export function Layout({ children }: { children: React.ReactNode }) {
	const { data: session } = useSession();
	const user = session?.user;
	const role = (user as { role?: string } | undefined)?.role ?? "player";

	return (
		<div className="min-h-screen bg-background">
			<header className="border-b border-border bg-card">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
					<a href="/" className="flex items-center gap-2 font-bold text-lg">
						<Swords className="h-5 w-5 text-primary" />
						Arena Agent
					</a>

					{user && (
						<div className="flex items-center gap-3">
							<Badge variant={role === "admin" ? "default" : "secondary"}>
								{role === "admin" && <Shield className="mr-1 h-3 w-3" />}
								{role}
							</Badge>

							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<Button variant="ghost" className="relative h-8 w-8 rounded-full">
										<Avatar className="h-8 w-8">
											<AvatarImage src={user.image ?? undefined} alt={user.name} />
											<AvatarFallback>{user.name?.charAt(0).toUpperCase() ?? "?"}</AvatarFallback>
										</Avatar>
									</Button>
								</DropdownMenuTrigger>
								<DropdownMenuContent align="end">
									<div className="px-2 py-1.5 text-sm">
										<p className="font-medium">{user.name}</p>
										<p className="text-muted-foreground text-xs">{user.email}</p>
									</div>
									<DropdownMenuSeparator />
									{role === "admin" && (
										<DropdownMenuItem asChild>
											<a href="/admin">
												<Users className="mr-2 h-4 w-4" />
												Admin Panel
											</a>
										</DropdownMenuItem>
									)}
									<DropdownMenuItem
										onClick={() =>
											signOut({ fetchOptions: { onSuccess: () => window.location.reload() } })
										}
									>
										<LogOut className="mr-2 h-4 w-4" />
										Sign out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>
					)}
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
		</div>
	);
}
