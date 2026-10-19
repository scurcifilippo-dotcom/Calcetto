const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.CALCETTO_BASE_URL || "http://127.0.0.1:3001/calcetto-anteprima.html";
const players = [
  ["trieu", "Trieu"], ["egor", "Egor"], ["pippo", "Pippo"],
  ["pujia", "Pujia"], ["presidente", "Presidente"], ["adriano", "Adriano"],
  ["tiziano", "Tiziano"], ["lele", "Lele"], ["buba", "Buba"],
  ["michele", "Michele"], ["cristian", "Cristian"], ["baldo", "Baldo"],
  ["fiori", "Fiori"], ["gigi", "Gigi"], ["arossa", "Arossa"],
];

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    // A fresh, nonpersistent context keeps this test out of anyone else's preview.
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    const nav = async (name) => {
      await page.getByRole("navigation", { name: "Navigazione principale", exact: true })
        .getByRole("button", { name: new RegExp(`^${name}(?:\\s|$)`) }).click();
      await page.getByRole("heading", { level: 1, name, exact: true }).waitFor();
    };
    const closeDialog = async () => {
      await page.getByRole("dialog").getByRole("button", { name: "Chiudi finestra", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden" });
    };
    const homeStat = async (label) => page.locator(".stat-card")
      .filter({ has: page.getByText(label, { exact: true }) }).locator(".stat-value").innerText();
    const statsFor = async (name) => {
      const row = page.locator(".stats-table tbody tr").filter({
        has: page.locator(".player-name", { hasText: new RegExp(`^${name}$`) }),
      });
      await row.waitFor();
      assert.equal(await row.count(), 1, `Exactly one statistics row for ${name}`);
      return row.locator("td").evaluateAll((cells) => cells.slice(2).map((cell) => cell.textContent.trim()));
    };
    const verifyCompletedStats = async () => {
      await nav("Statistiche");
      await page.getByLabel("Filtra per stagione", { exact: true }).selectOption("");
      assert.deepEqual(await statsFor("Trieu"), ["1", "1", "6,5", "1"]);
      assert.deepEqual(await statsFor("Egor"), ["1", "0", "7,5", "0"]);
      for (const [, name] of players.slice(2)) {
        const played = players.slice(0, 10).some(([, playerName]) => playerName === name) ? "1" : "0";
        assert.deepEqual(await statsFor(name), [played, "0", "—", "0"], `${name}: no invented rating`);
      }
    };

    const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200, "Preview responds successfully");
    await page.getByRole("button", { name: "Nuova partita", exact: true }).click({ trial: true });
    assert.equal(await homeStat("Giocatori"), "15");
    assert.equal(await homeStat("Partite giocate"), "00");
    assert.equal(await homeStat("Gol segnati"), "00");
    assert.equal(await homeStat("Stagioni"), "00");
    assert.equal(await page.locator(".match-card").count(), 0, "No fictional matches on first visit");
    await nav("Giocatori");
    assert.equal(await page.locator(".player-card").count(), 15);
    for (const [, name] of players) {
      assert.equal(await page.locator(".player-card").getByRole("heading", { name, exact: true }).count(), 1);
    }
    console.log("PASS: 15 real players, separate Baldo and Fiori, no fictional matches or seasons.");

    await nav("Home");
    await page.getByRole("button", { name: "Crea stagione", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Nome della stagione", { exact: true }).fill("Stagione smoke A");
    await page.getByRole("dialog").getByRole("button", { name: "Crea stagione", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Nuova partita", exact: true }).click();
    const matchForm = page.getByRole("dialog");
    await matchForm.getByLabel("Data", { exact: true }).fill("2026-10-25");
    await matchForm.getByLabel("Ora", { exact: true }).fill("21:00");
    await matchForm.getByLabel("Campo", { exact: true }).fill("Campo del test isolato");
    for (const [, name] of players.slice(0, 10)) {
      const choice = matchForm.getByRole("button", { name: `Seleziona ${name}`, exact: true });
      await choice.click();
      assert.equal(await matchForm.getByRole("button", { name: `Rimuovi partecipante ${name}`, exact: true }).getAttribute("aria-pressed"), "true");
    }
    await matchForm.getByRole("button", { name: "Crea partita", exact: true }).click();
    await page.getByRole("dialog", { name: "La partita", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").getByRole("img", { name: /^Disponibilità confermata:/ }).count(), 0);
    for (const [, name] of players.slice(0, 10)) {
      await page.getByRole("dialog").getByRole("img", { name: `Disponibilità non confermata: ${name}`, exact: true }).waitFor();
    }
    await page.getByRole("dialog").getByRole("button", { name: /^Squadre e voti/ }).click();
    assert.equal(await page.getByRole("dialog").getByRole("combobox", { name: /^Squadra di / }).count(), 10);
    assert.equal(await page.getByLabel("Squadra di Trieu", { exact: true }).inputValue(), "A");
    await page.getByLabel("Gol di Trieu", { exact: true }).fill("1");
    await page.getByLabel("Risultato squadra A", { exact: true }).fill("1");
    await page.getByLabel("Risultato squadra B", { exact: true }).fill("0");
    await page.getByLabel("Voto di Trieu", { exact: true }).selectOption("6.5");
    await page.getByLabel("Voto di Egor", { exact: true }).selectOption("7.5");
    await page.getByLabel(/MVP della partita/).selectOption("trieu");
    await closeDialog();
    await nav("Statistiche");
    for (const [, name] of players) {
      assert.deepEqual(await statsFor(name), ["0", "0", "—", "0"], `${name}: selection and an unfinished match do not count as played`);
    }
    console.log("PASS: ten participants are chosen during creation, with zero confirmations and no premature statistics.");

    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("trieu");
    assert.equal(await page.getByRole("button", { name: "Nuova partita", exact: true }).count(), 0);
    await nav("Home");
    await page.getByRole("button", { name: "Vai alla partita", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Sono disponibile", exact: true }).click();
    await page.getByRole("dialog").getByRole("img", { name: "Disponibilità confermata: Trieu", exact: true }).waitFor();
    await page.getByRole("dialog").getByRole("button", { name: "Ritira disponibilità", exact: true }).click();
    await page.getByRole("dialog").getByRole("img", { name: "Disponibilità non confermata: Trieu", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").getByRole("img", { name: /^Disponibilità confermata:/ }).count(), 0);
    await page.getByRole("dialog").getByRole("button", { name: /^Squadre e voti/ }).click();
    await page.getByRole("dialog").getByRole("img", { name: "Disponibilità non confermata: Trieu", exact: true }).waitFor();
    assert.equal(await page.getByRole("dialog").getByRole("combobox", { name: /^Squadra di / }).count(), 10);
    assert.equal(await page.getByLabel("Squadra di Trieu", { exact: true }).inputValue(), "A");
    assert.equal(await page.getByLabel("Gol di Trieu", { exact: true }).inputValue(), "1");
    assert.equal(await page.getByLabel("Voto di Trieu", { exact: true }).inputValue(), "6.5");
    assert.equal(await page.getByLabel("Voto di Egor", { exact: true }).inputValue(), "7.5");
    assert.equal(await page.getByLabel(/MVP della partita/).inputValue(), "trieu");
    await closeDialog();
    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("arossa");
    await page.getByRole("button", { name: "Vai alla partita", exact: true }).click();
    assert.equal(await page.getByRole("dialog").getByRole("button", { name: "Sono disponibile", exact: true }).count(), 0);
    assert.equal(await page.getByRole("dialog").getByRole("button", { name: "Ritira disponibilità", exact: true }).count(), 0);
    await closeDialog();
    console.log("PASS: optional confirmation can be withdrawn without losing selection, team, goals, ratings or MVP; nonparticipants cannot confirm.");

    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("admin");
    await page.getByRole("button", { name: "Vai alla partita", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Squadre e voti/ }).click();
    assert.equal(await page.getByRole("dialog").getByRole("img", { name: /^Disponibilità confermata:/ }).count(), 0);
    await page.getByRole("dialog").getByRole("button", { name: "Concludi partita", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await verifyCompletedStats();
    await page.reload({ waitUntil: "networkidle" });
    await verifyCompletedStats();
    console.log("PASS: 5v5 completion with zero confirmations, score, goals, half-point ratings, MVP, missing ratings and persistence.");

    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("trieu");
    assert.equal(await page.getByRole("button", { name: "Nuova partita", exact: true }).count(), 0);
    await nav("Giocatori");
    const playerCard = (name) => page.locator(".player-card").filter({
      has: page.getByRole("heading", { name, exact: true }),
    });
    await playerCard("Egor").click();
    assert.equal(await page.getByRole("dialog").getByRole("button", { name: "Salva profilo", exact: true }).count(), 0);
    assert.equal(await page.getByRole("dialog").getByLabel("Il tuo ruolo").count(), 0);
    await closeDialog();
    await playerCard("Trieu").click();
    await page.getByRole("dialog").getByLabel("Il tuo ruolo").selectOption("Difensore");
    await page.getByRole("dialog").getByRole("button", { name: "Usa icona 🚀", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Salva profilo", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await playerCard("Trieu").locator(".role-badge").innerText(), "Difensore");
    assert.equal(await playerCard("Trieu").locator(".player-avatar").innerText(), "🚀");
    assert.equal(await playerCard("Egor").locator(".role-badge").innerText(), "Difensore");
    await page.reload({ waitUntil: "networkidle" });
    await nav("Giocatori");
    assert.equal(await playerCard("Trieu").locator(".player-avatar").innerText(), "🚀");
    assert.equal(await playerCard("Trieu").locator(".role-badge").innerText(), "Difensore");
    console.log("PASS: member customizes only their own profile; role and icon persist.");

    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("admin");
    await nav("Partite");
    await page.getByRole("button", { name: "Nuova stagione", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Nome della stagione", { exact: true }).fill("Stagione smoke B");
    await page.getByRole("dialog").getByRole("button", { name: "Crea stagione", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await nav("Statistiche");
    assert.equal(await page.getByLabel("Filtra per stagione", { exact: true }).locator("option:checked").innerText(), "Stagione smoke B");
    for (const [, name] of players) {
      assert.deepEqual(await statsFor(name), ["0", "0", "—", "0"], `${name}: empty second season`);
    }
    await page.getByLabel("Filtra per stagione", { exact: true }).selectOption({ label: "Stagione smoke A" });
    assert.deepEqual(await statsFor("Trieu"), ["1", "1", "6,5", "1"]);
    await verifyCompletedStats();
    console.log("PASS: independent season statistics and combined history.");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "Navigazione da telefono", exact: true })
      .getByRole("button", { name: "Home", exact: true }).click();
    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(widths.document <= widths.viewport + 1 && widths.body <= widths.viewport + 1,
      `Mobile home must not overflow horizontally: ${JSON.stringify(widths)}`);
    assert.deepEqual(pageErrors, [], "No uncaught browser errors");
    console.log("PASS: mobile Home at 390px has no horizontal overflow; no uncaught browser errors.");
    console.log("All smoke tests passed. Test data was confined to this disposable browser context.");
    await context.close();
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
