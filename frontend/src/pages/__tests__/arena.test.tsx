import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArenaPage } from "../arena";

// Mock the API client
vi.mock("@/lib/api", () => ({
	api: {
		api: {
			arenas: {
				":id": {
					$get: vi.fn().mockResolvedValue({
						json: () =>
							Promise.resolve({
								success: true,
								data: {
									id: "test-arena",
									name: "3 goblins vs a paladin",
									description: "3 goblins vs a paladin",
									status: "setup",
									round: 0,
									combatants: [],
									log: [],
								},
							}),
					}),
					messages: {
						$get: vi.fn().mockResolvedValue({
							json: () => Promise.resolve({ success: true, data: [] }),
						}),
					},
				},
			},
		},
	},
}));

function renderWithProviders(ui: React.ReactElement) {
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

describe("ArenaPage", () => {
	it("renders the combat arena header", () => {
		renderWithProviders(<ArenaPage arenaId="test-arena" />);
		expect(screen.getByText("Combat Arena")).toBeInTheDocument();
	});

	it("shows the ready state with start button when no messages exist", async () => {
		renderWithProviders(<ArenaPage arenaId="test-arena" />);
		expect(await screen.findByText("Ready to Fight")).toBeInTheDocument();
		expect(screen.getByText("Start Combat")).toBeInTheDocument();
	});

	it("shows the scenario description", async () => {
		renderWithProviders(<ArenaPage arenaId="test-arena" />);
		expect(await screen.findByText(/3 goblins vs a paladin/)).toBeInTheDocument();
	});
});
