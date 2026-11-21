import { render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { Home } from "../src/pages/Home";
import * as api from "../src/api";

vi.mock("../src/api");

beforeEach(() => {
  vi.resetAllMocks();
});

test("l'accueil affiche une carte par enfant", async () => {
  vi.mocked(api.getChildren).mockResolvedValue([
    { id: "1", displayName: "Sara", ageBand: "11-14" },
    { id: "2", displayName: "Omar", ageBand: "7-10" },
  ]);
  vi.mocked(api.getDevices).mockResolvedValue([]);

  render(<Home />);

  expect(await screen.findByText("Sara")).toBeInTheDocument();
  expect(screen.getByText("Omar")).toBeInTheDocument();
});

test("le statut en ligne d'un appareil est affiché sur la carte de l'enfant", async () => {
  vi.mocked(api.getChildren).mockResolvedValue([{ id: "1", displayName: "Sara", ageBand: "11-14" }]);
  vi.mocked(api.getDevices).mockResolvedValue([
    { id: "d1", childId: "1", name: "PC-Sara", os: "windows", lastSeenAt: new Date().toISOString(), online: true },
  ]);

  render(<Home />);

  expect(await screen.findByText("PC-Sara")).toBeInTheDocument();
  expect(screen.getByText("En ligne")).toBeInTheDocument();
});
