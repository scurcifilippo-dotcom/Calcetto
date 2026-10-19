const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.CALCETTO_BASE_URL || "http://127.0.0.1:3001/calcetto-anteprima.html";
const participants = ["Trieu", "Egor", "Pippo", "Pujia", "Presidente", "Adriano", "Tiziano", "Lele", "Buba", "Michele"];

async function navigate(scope, name) {
  await scope.getByRole("navigation", { name: "Navigazione principale", exact: true })
    .getByRole("button", { name: new RegExp(`^${name}(?:\\s|$)`) }).click();
  await scope.getByRole("heading", { level: 1, name, exact: true }).waitFor();
}

async function closeDialog(scope) {
  await scope.getByRole("dialog").getByRole("button", { name: "Chiudi finestra", exact: true }).click();
  await scope.getByRole("dialog").waitFor({ state: "hidden" });
}

async function homeStat(scope, label) {
  return scope.locator(".stat-card").filter({ has: scope.getByText(label, { exact: true }) })
    .locator(".stat-value").innerText();
}

function playerCard(scope, name) {
  return scope.locator(".player-card").filter({ has: scope.getByRole("heading", { name, exact: true }) });
}

async function createSeason(scope, name, first = false) {
  await navigate(scope, "Home");
  await scope.getByRole("button", { name: first ? "Crea stagione" : "Nuova stagione", exact: true }).click();
  const dialog = scope.getByRole("dialog", { name: "Nuova stagione", exact: true });
  await dialog.waitFor();
  await dialog.getByLabel("Nome della stagione", { exact: true }).fill(name);
  await dialog.getByRole("button", { name: "Crea stagione", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
}

async function assertTemporaryWarning(scope) {
  const warning = scope.locator(".storage-warning");
  await warning.waitFor({ state: "visible" });
  assert.match(await warning.innerText(), /solo in questa sessione/i);
  assert.equal(await warning.getAttribute("role"), "status");
  assert.equal(await warning.evaluate((element) => Boolean(element.closest(".toast"))), false,
    "Storage warning must persist separately from notification toasts");
  const closeToast = scope.getByRole("button", { name: "Chiudi messaggio", exact: true });
  if (await closeToast.count()) await closeToast.click();
  await navigate(scope, "Statistiche");
  await warning.waitFor({ state: "visible" });
  await navigate(scope, "Home");
  await warning.waitFor({ state: "visible" });
}

async function addPlayer(scope, name) {
  await navigate(scope, "Giocatori");
  await scope.getByRole("button", { name: "Nuovo giocatore", exact: true }).click();
  const dialog = scope.getByRole("dialog", { name: "Nuovo giocatore", exact: true });
  await dialog.waitFor();
  await dialog.getByLabel(/Nome(?: del)? giocatore/).fill(name);
  await dialog.getByLabel(/^Ruolo/).selectOption("Attaccante");
  await dialog.getByRole("button", { name: "Usa icona 🚀", exact: true }).click();
  await dialog.getByRole("button", { name: "Aggiungi giocatore", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  await playerCard(scope, name).waitFor();
  assert.equal(await scope.locator(".player-card").count(), 16);
  assert.equal(await playerCard(scope, name).locator(".role-badge").innerText(), "Attaccante");
  assert.equal(await playerCard(scope, name).locator(".player-avatar").innerText(), "🚀");
}

async function createMatch(scope, venue) {
  await navigate(scope, "Home");
  await scope.getByRole("button", { name: "Nuova partita", exact: true }).click();
  const dialog = scope.getByRole("dialog", { name: "Nuova partita", exact: true });
  await dialog.getByLabel("Data", { exact: true }).fill("2026-11-02");
  await dialog.getByLabel("Ora", { exact: true }).fill("21:00");
  await dialog.getByLabel("Campo", { exact: true }).fill(venue);
  for (const name of participants) {
    const choice = dialog.getByRole("button", { name: `Seleziona ${name}`, exact: true });
    await choice.click();
    assert.equal(await dialog.getByRole("button", { name: `Rimuovi partecipante ${name}`, exact: true }).getAttribute("aria-pressed"), "true");
  }
  await dialog.getByRole("button", { name: "Crea partita", exact: true }).click();
  const detail = scope.getByRole("dialog", { name: "La partita", exact: true });
  await detail.waitFor();
  assert.ok((await detail.innerText()).includes(venue));
  assert.equal(await detail.getByRole("img", { name: /^Disponibilità confermata:/ }).count(), 0);
  for (const name of participants) {
    await detail.getByRole("img", { name: `Disponibilità non confermata: ${name}`, exact: true }).waitFor();
  }
  await closeDialog(scope);
  assert.equal(await homeStat(scope, "Partite giocate"), "00", "Selecting participants is not a completed match");

  await scope.getByLabel("Vista anteprima", { exact: true }).selectOption("trieu");
  await scope.getByRole("button", { name: "Vai alla partita", exact: true }).waitFor();
  await scope.getByRole("button", { name: "Vai alla partita", exact: true }).click();
  await detail.getByRole("button", { name: "Sono disponibile", exact: true }).click();
  await detail.getByRole("img", { name: "Disponibilità confermata: Trieu", exact: true }).waitFor();
  await detail.getByRole("button", { name: "Ritira disponibilità", exact: true }).click();
  await detail.getByRole("img", { name: "Disponibilità non confermata: Trieu", exact: true }).waitFor();
  await detail.getByRole("button", { name: /^Squadre e voti/ }).click();
  assert.equal(await detail.getByRole("combobox", { name: /^Squadra di / }).count(), 10,
    "Withdrawing optional confirmation must preserve the participants");
  await closeDialog(scope);
  await scope.getByLabel("Vista anteprima", { exact: true }).selectOption("admin");
  await scope.getByRole("button", { name: "Vai alla partita", exact: true }).click();
  await detail.getByRole("button", { name: /^Squadre e voti/ }).click();
  assert.equal(await detail.getByRole("img", { name: /^Disponibilità confermata:/ }).count(), 0);
  await detail.getByRole("button", { name: "Concludi partita", exact: true }).click();
  await detail.waitFor({ state: "hidden" });
  assert.equal(await homeStat(scope, "Partite giocate"), "01", "A match can finish with no confirmations");
  await navigate(scope, "Statistiche");
  const row = scope.locator(".stats-table tbody tr").filter({
    has: scope.locator(".player-name", { hasText: /^Trieu$/ }),
  });
  assert.deepEqual(await row.locator("td").evaluateAll((cells) => cells.slice(2).map((cell) => cell.textContent.trim())),
    ["1", "0", "—", "0"]);
  await navigate(scope, "Home");
}

async function normalPreview(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    assert.equal(await homeStat(page, "Stagioni"), "00");
    assert.equal(await homeStat(page, "Giocatori"), "15");

    await createSeason(page, "Stagione regressione A", true);
    assert.equal(await homeStat(page, "Stagioni"), "01");
    await createSeason(page, "Stagione regressione B");
    assert.equal(await homeStat(page, "Stagioni"), "02");
    await addPlayer(page, "Nuovo amico");
    assert.equal(await page.locator(".nav-count").innerText(), "16");
    assert.match(await page.locator(".group-card").innerText(), /16 giocatori/);

    const newOption = page.getByLabel("Vista anteprima", { exact: true })
      .locator("option").filter({ hasText: /^Gioca come Nuovo amico$/ });
    assert.equal(await newOption.count(), 1);
    const newPlayerId = await newOption.getAttribute("value");
    assert.ok(newPlayerId && newPlayerId !== "admin");
    await navigate(page, "Home");
    assert.equal(await homeStat(page, "Giocatori"), "16");
    await navigate(page, "Statistiche");
    const statRow = page.locator(".stats-table tbody tr").filter({
      has: page.locator(".player-name", { hasText: /^Nuovo amico$/ }),
    });
    assert.deepEqual(await statRow.locator("td").evaluateAll((cells) => cells.slice(2).map((cell) => cell.textContent.trim())),
      ["0", "0", "—", "0"]);

    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await homeStat(page, "Stagioni"), "02");
    assert.equal(await homeStat(page, "Giocatori"), "16");
    await navigate(page, "Giocatori");
    assert.equal(await page.locator(".player-card").count(), 16);
    assert.equal(await playerCard(page, "Nuovo amico").locator(".player-avatar").innerText(), "🚀");

    await page.getByRole("button", { name: "Nuovo giocatore", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Nuovo giocatore", exact: true });
    await dialog.getByLabel(/Nome(?: del)? giocatore/).fill("  nuovo   AMICO  ");
    await dialog.getByLabel(/^Ruolo/).selectOption("Attaccante");
    await dialog.getByRole("button", { name: "Aggiungi giocatore", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: /già presente/i }).waitFor();
    assert.equal(await page.locator(".player-card").count(), 16, "Case and whitespace variations cannot duplicate a player");
    await closeDialog(page);
    await page.getByLabel("Vista anteprima", { exact: true }).selectOption(newPlayerId);
    await playerCard(page, "Nuovo amico").getByText("Il tuo profilo · Personalizza", { exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Nuovo giocatore", exact: true }).count(), 0);
    await navigate(page, "Home");
    assert.equal(await page.getByRole("button", { name: "Nuova stagione", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Nuova partita", exact: true }).count(), 0);
    assert.equal(await page.locator(".storage-warning").count(), 0, "Normal browser storage stays persistent");

    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("admin");
    await page.getByRole("button", { name: "Nuova partita", exact: true }).click();
    const emptyMatch = page.getByRole("dialog", { name: "Nuova partita", exact: true });
    await emptyMatch.getByLabel("Data", { exact: true }).fill("2026-11-03");
    await emptyMatch.getByLabel("Ora", { exact: true }).fill("21:00");
    await emptyMatch.getByLabel("Campo", { exact: true }).fill("Campo senza partecipanti iniziali");
    await emptyMatch.getByRole("button", { name: "Crea partita", exact: true }).click();
    const emptyDetail = page.getByRole("dialog", { name: "La partita", exact: true });
    await emptyDetail.waitFor();
    await emptyDetail.getByRole("button", { name: /^Squadre e voti/ }).click();
    assert.equal(await emptyDetail.getByRole("combobox", { name: /^Squadra di / }).count(), 0,
      "Creating a scheduled match with zero initial participants is allowed");
    await closeDialog(page);
    await page.reload({ waitUntil: "networkidle" });
    assert.equal(await homeStat(page, "Partite giocate"), "00");
    await navigate(page, "Partite");
    assert.equal(await page.locator(".match-card").count(), 1, "Empty scheduled match survives reload");
    assert.deepEqual(errors, []);
    console.log("PASS: normal preview creates seasons, player and a match with zero initial participants; updates counters, persists, blocks duplicates and respects member controls.");
  } finally {
    await context.close();
  }
}

async function unavailableStorage(browser, kind) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  try {
    if (kind === "SecurityError") {
      await context.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get() { throw new DOMException("Storage unavailable in regression test", "SecurityError"); },
        });
      });
    } else if (kind === "QuotaExceededError") {
      await context.addInitScript(() => {
        Storage.prototype.setItem = function () {
          throw new DOMException("Storage quota exhausted in regression test", "QuotaExceededError");
        };
      });
    }
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const blockedSubmissions = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (/Blocked form submission/i.test(message.text())) blockedSubmissions.push(message.text());
    });
    let scope = page;
    if (kind === "sandbox") {
      // The actual restrictions used by a preview: scripts work, forms and storage do not.
      // No allow-forms, allow-same-origin or security-disabling browser flags are added.
      await page.setContent('<iframe name="calcetto-preview" sandbox="allow-scripts" style="width:1440px;height:1000px"></iframe>');
      await page.locator("iframe").evaluate((iframe, url) => { iframe.src = url; }, baseUrl);
      scope = page.frameLocator("iframe");
    } else {
      const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
    }

    await scope.getByRole("button", { name: "Crea stagione", exact: true }).waitFor();
    const storageFailure = await scope.locator("body").evaluate(() => {
      try {
        localStorage.setItem("calcetto-regression-probe", "1");
        localStorage.removeItem("calcetto-regression-probe");
        return null;
      } catch (error) { return error.name; }
    });
    assert.equal(storageFailure, kind === "sandbox" ? "SecurityError" : kind,
      "The test must actually exercise unavailable storage");
    await createSeason(scope, `Stagione ${kind} A`, true);
    assert.equal(await homeStat(scope, "Stagioni"), "01");
    await assertTemporaryWarning(scope);
    await createSeason(scope, `Stagione ${kind} B`);
    assert.equal(await homeStat(scope, "Stagioni"), "02", "Memory fallback retains previous changes");
    await addPlayer(scope, "Amico temporaneo");
    await createMatch(scope, `Campo ${kind}`);
    assert.equal(await homeStat(scope, "Giocatori"), "16");
    assert.equal(await homeStat(scope, "Stagioni"), "02");
    await assertTemporaryWarning(scope);
    assert.deepEqual(blockedSubmissions, [], "Preview actions must work without native form submission permission");
    assert.deepEqual(errors, [], "Unavailable storage must not cause uncaught browser errors");
    console.log(`PASS: ${kind} preview creates seasons and player, selects ten participants before creation, withdraws optional confirmation and finishes with zero confirmations; persistent warning and no blocked form submissions.`);
  } finally {
    await context.close();
  }
}

async function run() {
  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  try {
    await normalPreview(browser);
    await unavailableStorage(browser, "sandbox");
    await unavailableStorage(browser, "SecurityError");
    await unavailableStorage(browser, "QuotaExceededError");
    console.log("All preview regressions passed in isolated disposable browser contexts.");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
