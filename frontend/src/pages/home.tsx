import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, Swords } from "lucide-react";
import { useState } from "react";
import { Layout } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

export function HomePage() {
	const [prompt, setPrompt] = useState("");
	const queryClient = useQueryClient();

	const { data: arenas, isLoading } = useQuery({
		queryKey: ["arenas"],
		queryFn: async () => {
			const res = await api.api.arenas.$get();
			return res.json();
		},
	});

	const createArena = useMutation({
		mutationFn: async (message: string) => {
			const res = await api.api.arenas.$post({
				json: { message },
			});
			return res.json();
		},
		onSuccess: (data) => {
			queryClient.invalidateQueries({ queryKey: ["arenas"] });
			if ("data" in data && data.data) {
				window.location.href = `/arena/${data.data.arenaId}`;
			}
		},
	});

	return (
		<Layout>
			<div className="space-y-6">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Combat Arena</h1>
					<p className="text-muted-foreground">
						Describe a combat scenario and let the Arena Master handle the rest.
					</p>
				</div>

				{/* New arena prompt */}
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Plus className="h-5 w-5" />
							New Encounter
						</CardTitle>
						<CardDescription>
							Describe who's fighting. e.g. "3 goblins vs a level 5 paladin" or "an ancient red
							dragon vs a party of 4 adventurers"
						</CardDescription>
					</CardHeader>
					<CardContent>
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								if (prompt.trim()) {
									createArena.mutate(prompt.trim());
								}
							}}
						>
							<Input
								placeholder="Describe your combat scenario..."
								value={prompt}
								onChange={(e) => setPrompt(e.target.value)}
								disabled={createArena.isPending}
								className="flex-1"
							/>
							<Button type="submit" disabled={!prompt.trim() || createArena.isPending}>
								{createArena.isPending ? (
									"Setting up..."
								) : (
									<>
										<Swords className="mr-2 h-4 w-4" />
										Fight!
									</>
								)}
							</Button>
						</form>
					</CardContent>
				</Card>

				{/* Arena list */}
				<div className="space-y-3">
					<h2 className="text-xl font-semibold">Your Arenas</h2>
					{isLoading && <p className="text-muted-foreground">Loading...</p>}
					{arenas?.data?.length === 0 && (
						<p className="text-muted-foreground">
							No arenas yet. Create your first encounter above!
						</p>
					)}
					<div className="grid gap-3">
						{arenas?.data?.map(
							(arena: {
								id: string;
								name: string;
								status: string;
								round: number;
								createdAt: string;
							}) => (
								<a key={arena.id} href={`/arena/${arena.id}`}>
									<Card className="transition-colors hover:bg-accent/50">
										<CardContent className="flex items-center justify-between py-4">
											<div className="flex items-center gap-3">
												<MessageSquare className="h-5 w-5 text-muted-foreground" />
												<div>
													<p className="font-medium">{arena.name}</p>
													<p className="text-xs text-muted-foreground">
														Round {arena.round} • {new Date(arena.createdAt).toLocaleDateString()}
													</p>
												</div>
											</div>
											<Badge
												variant={
													arena.status === "active"
														? "default"
														: arena.status === "completed"
															? "secondary"
															: "outline"
												}
											>
												{arena.status}
											</Badge>
										</CardContent>
									</Card>
								</a>
							),
						)}
					</div>
				</div>
			</div>
		</Layout>
	);
}
