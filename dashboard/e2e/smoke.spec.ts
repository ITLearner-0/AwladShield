import { expect, test, type Page } from "@playwright/test";
import { authenticator } from "otplib";

// Flux complet contre le serveur réel : setup -> confirm -> login -> enfant -> appairage.
const PARENT = { name: "Parent", email: "parent@awlad.test", password: "s3cret-pass!" };

test("setup, confirmation TOTP, connexion, ajout d'un enfant puis code d'appairage", async ({ page }) => {
  let secret = "";
  page.on("response", async (res) => {
    if (res.request().method() === "POST" && res.url().endsWith("/api/setup") && res.ok()) {
      const body = (await res.json()) as { otpauthUrl: string };
      secret = new URL(body.otpauthUrl).searchParams.get("secret") ?? "";
    }
  });

  // Premier démarrage : la racine route vers la configuration initiale.
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Bienvenue sur AwladShield" })).toBeVisible();

  await page.getByLabel("Nom affiché").fill(PARENT.name);
  await page.getByLabel("E-mail").fill(PARENT.email);
  await page.getByLabel("Mot de passe").fill(PARENT.password);
  await page.getByRole("button", { name: "Créer le compte" }).click();

  // Étape de confirmation : on attend le secret capturé puis on saisit un code valide.
  await expect(page.getByRole("heading", { name: "Activez l'authentification" })).toBeVisible();
  await expect.poll(() => secret).not.toBe("");
  await page.getByLabel("Code à 6 chiffres").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Valider et continuer" }).click();

  // Retour au login.
  await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
  await login(page, secret);

  // Shell authentifié.
  await expect(page.getByRole("heading", { name: "Accueil" })).toBeVisible();

  // Ajout d'un enfant.
  await page.getByRole("button", { name: "Enfants" }).click();
  await page.getByLabel("Nom affiché").fill("Sara");
  await page.getByLabel("Tranche d'âge").selectOption("11-14");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await expect(page.getByText("Sara")).toBeVisible();

  // Génération d'un code d'appairage.
  await page.getByRole("button", { name: "Appairage" }).click();
  await page.getByLabel("Enfant").selectOption({ label: "Sara" });
  await page.getByLabel("Nom de l'appareil").fill("PC-Sara");
  await page.getByRole("button", { name: "Générer un code" }).click();
  await expect(page.getByRole("heading", { name: "Code d'appairage" })).toBeVisible();
  const codeValue = page.locator(".code-value");
  await expect(codeValue).toBeVisible();
  await expect(codeValue).not.toBeEmpty();
});

async function login(page: Page, secret: string): Promise<void> {
  await page.getByLabel("E-mail").fill(PARENT.email);
  await page.getByLabel("Mot de passe").fill(PARENT.password);
  await page.getByLabel("Code à 6 chiffres").fill(authenticator.generate(secret));
  await page.getByRole("button", { name: "Se connecter" }).click();
}
