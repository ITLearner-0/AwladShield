import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { Login } from "../src/pages/Login";
import * as api from "../src/api";

vi.mock("../src/api");

beforeEach(() => {
  vi.resetAllMocks();
});

test("le formulaire de login envoie email+password+totp", async () => {
  const onSuccess = vi.fn();
  vi.mocked(api.login).mockResolvedValue({ parentId: "p1", displayName: "Parent" });

  render(<Login onSuccess={onSuccess} />);
  await userEvent.type(screen.getByLabelText("E-mail"), "p@x.fr");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "s3cret!");
  await userEvent.type(screen.getByLabelText("Code à 6 chiffres"), "123456");
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

  expect(api.login).toHaveBeenCalledWith({ email: "p@x.fr", password: "s3cret!", totp: "123456" });
});

test("un échec de connexion affiche un message générique", async () => {
  vi.mocked(api.login).mockRejectedValue(new api.ApiError(401));

  render(<Login onSuccess={vi.fn()} />);
  await userEvent.type(screen.getByLabelText("E-mail"), "p@x.fr");
  await userEvent.type(screen.getByLabelText("Mot de passe"), "nope");
  await userEvent.type(screen.getByLabelText("Code à 6 chiffres"), "000000");
  await userEvent.click(screen.getByRole("button", { name: "Se connecter" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Identifiants ou code incorrects.");
});
