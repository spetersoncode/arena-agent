import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Eye, Shield, Swords, UserIcon, Users } from "lucide-react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { api } from "@/lib/api";

const ROLE_ICONS = {
	admin: Shield,
	player: Swords,
	spectator: Eye,
} as const;

export function AdminPage() {
	const queryClient = useQueryClient();

	const { data: stats } = useQuery({
		queryKey: ["admin-stats"],
		queryFn: async () => {
			const res = await api.api.admin.stats.$get();
			return res.json();
		},
	});

	const { data: users, isLoading } = useQuery({
		queryKey: ["admin-users"],
		queryFn: async () => {
			const res = await api.api.admin.users.$get();
			return res.json();
		},
	});

	const updateRole = useMutation({
		mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
			const res = await api.api.admin.users[":id"].role.$patch({
				param: { id: userId },
				json: { role: role as "admin" | "player" | "spectator" },
			});
			return res.json();
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["admin-users"] });
			queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
		},
	});

	const statData = stats?.data as
		| {
				totalUsers: number;
				totalArenas: number;
				activeArenas: number;
				usersByRole: { admin: number; player: number; spectator: number };
		  }
		| undefined;

	return (
		<Layout>
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Admin Panel</h1>
					<p className="text-muted-foreground">Manage users and monitor the arena.</p>
				</div>

				{/* Stats */}
				{statData && (
					<div className="grid gap-3 sm:grid-cols-3">
						<Card>
							<CardContent className="flex items-center gap-3 py-4">
								<Users className="h-8 w-8 text-muted-foreground" />
								<div>
									<p className="text-2xl font-bold">{statData.totalUsers}</p>
									<p className="text-xs text-muted-foreground">Total Users</p>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="flex items-center gap-3 py-4">
								<Swords className="h-8 w-8 text-muted-foreground" />
								<div>
									<p className="text-2xl font-bold">{statData.totalArenas}</p>
									<p className="text-xs text-muted-foreground">Total Arenas</p>
								</div>
							</CardContent>
						</Card>
						<Card>
							<CardContent className="flex items-center gap-3 py-4">
								<Swords className="h-8 w-8 text-primary" />
								<div>
									<p className="text-2xl font-bold">{statData.activeArenas}</p>
									<p className="text-xs text-muted-foreground">Active Battles</p>
								</div>
							</CardContent>
						</Card>
					</div>
				)}

				{/* User Management */}
				<Card>
					<CardHeader>
						<CardTitle>User Management</CardTitle>
						<CardDescription>
							Change user roles to control access. Admins can manage everything, players can create
							arenas, spectators can only view.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{isLoading && <p className="text-muted-foreground">Loading users...</p>}
						<div className="space-y-2">
							{(
								users?.data as
									| { id: string; name: string; email: string; role: string; image?: string }[]
									| undefined
							)?.map((user) => {
								const RoleIcon = ROLE_ICONS[user.role as keyof typeof ROLE_ICONS] ?? UserIcon;
								return (
									<div
										key={user.id}
										className="flex items-center justify-between rounded-lg border p-3"
									>
										<div className="flex items-center gap-3">
											<RoleIcon className="h-4 w-4 text-muted-foreground" />
											<div>
												<p className="font-medium">{user.name}</p>
												<p className="text-xs text-muted-foreground">{user.email}</p>
											</div>
										</div>

										<DropdownMenu>
											<DropdownMenuTrigger asChild>
												<Button variant="outline" size="sm">
													<Badge variant="secondary" className="mr-1">
														{user.role}
													</Badge>
													<ChevronDown className="h-3 w-3" />
												</Button>
											</DropdownMenuTrigger>
											<DropdownMenuContent>
												{(["admin", "player", "spectator"] as const).map((role) => (
													<DropdownMenuItem
														key={role}
														onClick={() => updateRole.mutate({ userId: user.id, role })}
														disabled={user.role === role}
													>
														{role.charAt(0).toUpperCase() + role.slice(1)}
													</DropdownMenuItem>
												))}
											</DropdownMenuContent>
										</DropdownMenu>
									</div>
								);
							})}
						</div>
					</CardContent>
				</Card>
			</div>
		</Layout>
	);
}
