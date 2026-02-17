import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "../login";

// Mock the auth client
vi.mock("@/lib/auth-client", () => ({
	signIn: {
		social: vi.fn(),
	},
}));

describe("LoginPage", () => {
	it("renders the app name", () => {
		render(<LoginPage />);
		expect(screen.getByText("Arena Agent")).toBeInTheDocument();
	});

	it("renders the sign in button", () => {
		render(<LoginPage />);
		expect(screen.getByText("Sign in with Google")).toBeInTheDocument();
	});

	it("shows the description", () => {
		render(<LoginPage />);
		expect(screen.getByText(/D&D 5e combat arena powered by AI/)).toBeInTheDocument();
	});
});
