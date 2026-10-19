const assert = require("node:assert/strict");
const { chromium } = require("playwright");

const baseUrl = process.env.CALCETTO_BASE_URL || "http://127.0.0.1:3001/calcetto-anteprima.html";
async function navigate(scope, name, mobile = false) {
  const button = scope.getByRole("navigation", {
    name: mobile ? "Navigazione da telefono" : "Navigazione principale", exact: true,
  }).getByRole("button", { name: new RegExp(`^${name}(?:\\s|$)`) });
  await button.click();
  await scope.getByRole("heading", { level: 1, name: new RegExp(`^${name}\\.?$`) }).waitFor();
  assert.equal(await button.getAttribute("aria-current"), "page");
}

async function closeDialog(scope) {
  await scope.getByRole("dialog").getByRole("button", { name: "Chiudi finestra", exact: true }).click();
  await scope.getByRole("dialog").waitFor({ state: "hidden" });
}

function log(scope) {
  return scope.getByRole("log", { name: "Messaggi del gruppo", exact: true });
}

async function assertMessageCount(scope, count) {
  if (count) await log(scope).getByRole("article").nth(count - 1).waitFor();
  assert.equal(await log(scope).getByRole("article").count(), count);
}

async function sendText(scope, text, expectedCount) {
  await scope.getByRole("textbox", { name: "Messaggio per il gruppo", exact: true }).fill(text);
  await scope.getByRole("button", { name: "Invia messaggio", exact: true }).click();
  await assertMessageCount(scope, expectedCount);
  assert.equal(await scope.getByRole("textbox", { name: "Messaggio per il gruppo", exact: true }).inputValue(), "");
}

async function prepareExistingData(page) {
  await page.getByRole("button", { name: "Crea stagione", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Nome della stagione", { exact: true }).fill("Stagione chat");
  await page.getByRole("dialog").getByRole("button", { name: "Crea stagione", exact: true }).click();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  await page.getByRole("button", { name: "Nuova partita", exact: true }).click();
  const match = page.getByRole("dialog");
  await match.getByLabel("Data", { exact: true }).fill("2026-11-05");
  await match.getByLabel("Ora", { exact: true }).fill("21:00");
  await match.getByLabel("Campo", { exact: true }).fill("Campo test chat");
  await match.getByRole("button", { name: "Seleziona Trieu", exact: true }).click();
  await match.getByRole("button", { name: "Crea partita", exact: true }).click();
  await page.getByRole("dialog", { name: "La partita", exact: true }).waitFor();
  await closeDialog(page);
  await navigate(page, "Giocatori");
  await page.getByRole("button", { name: "Nuovo giocatore", exact: true }).click();
  const player = page.getByRole("dialog", { name: "Nuovo giocatore", exact: true });
  await player.getByLabel(/Nome(?: del)? giocatore/).fill("Amico chat");
  await player.getByLabel(/^Ruolo/).selectOption("Centrocampista");
  await player.getByRole("button", { name: "Aggiungi giocatore", exact: true }).click();
  await player.waitFor({ state: "hidden" });
}

async function normalChat(browser) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    await prepareExistingData(page);
    // Simulate a genuine older snapshot that predates the chat field.
    await page.evaluate(() => {
      const key = "calcetto-preview-v1";
      const data = JSON.parse(localStorage.getItem(key));
      delete data.messages;
      localStorage.setItem(key, JSON.stringify(data));
    });
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "Chat");
    await assertMessageCount(page, 0);
    await log(page).getByRole("heading", { name: "Nessun messaggio", exact: true }).waitFor();

    const composer = page.getByRole("textbox", { name: "Messaggio per il gruppo", exact: true });
    const send = page.getByRole("button", { name: "Invia messaggio", exact: true });
    assert.equal(await send.isDisabled(), true);
    await composer.fill("   ");
    assert.equal(await send.isDisabled(), true, "Whitespace is not a message");
    await composer.fill("Prima riga");
    await composer.press("Shift+Enter");
    await composer.pressSequentially("Seconda riga");
    assert.equal(await composer.inputValue(), "Prima riga\nSeconda riga");
    await assertMessageCount(page, 0);
    await composer.fill("Bozza IME");
    await composer.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, bubbles: true });
    await assertMessageCount(page, 0);
    assert.equal(await composer.inputValue(), "Bozza IME", "IME confirmation must not send the draft");
    await sendText(page, "Messaggio amministratore", 1);
    const adminMessage = log(page).getByRole("article", { name: "Messaggio di Amministratore", exact: true });
    assert.equal(await adminMessage.count(), 1);
    assert.equal(await adminMessage.locator(".chat-message-text").innerText(), "Messaggio amministratore");

    // These are author perspectives within one local preview, not authenticated clients.
    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("trieu");
    await page.getByRole("button", { name: "Menziona un giocatore", exact: true }).click();
    await page.getByRole("textbox", { name: "Cerca un giocatore da menzionare", exact: true }).fill("Egor");
    await page.getByRole("listbox", { name: "Giocatori da menzionare", exact: true })
      .getByRole("option", { name: /^Egor/ }).click();
    assert.match(await composer.inputValue(), /^@Egor\s/);
    await composer.fill(`${await composer.inputValue()}Ci sei per la partita?`);
    await send.click();
    await assertMessageCount(page, 2);
    const trieuMessage = log(page).getByRole("article", { name: "Messaggio di Trieu", exact: true });
    assert.deepEqual(await trieuMessage.locator("mark.chat-mention").allTextContents(), ["@Egor"], await trieuMessage.innerText());
    await page.getByLabel("Vista anteprima", { exact: true }).selectOption("egor");
    await assertMessageCount(page, 2);
    assert.equal(await adminMessage.count(), 1);
    assert.equal(await trieuMessage.count(), 1);
    assert.deepEqual(await trieuMessage.locator("mark.chat-mention").allTextContents(), ["@Egor"], await trieuMessage.innerText());

    await page.getByRole("button", { name: "Scegli uno sticker", exact: true }).click();
    await page.getByRole("button", { name: "Invia sticker: Gol", exact: true }).click();
    await assertMessageCount(page, 3);
    const stickerMessage = log(page).getByRole("article").nth(2);
    assert.equal(await stickerMessage.getAttribute("aria-label"), "Messaggio di Egor");
    assert.equal(await stickerMessage.locator(".chat-sticker").getAttribute("aria-label"), "Sticker: Gol");

    assert.equal(await page.getByRole("button", { name: /GIF|foto|carica|allega/i }).count(), 0);
    assert.equal(await page.locator('.chat-shell input[type="file"]').count(), 0);
    assert.equal(await page.locator('.chat-shell img').count(), 0, "Chat uses only icons and emoji stickers");
    console.log("PASS: empty/whitespace, Shift+Enter, IME, admin/player text, mentions and emoji stickers; no media controls or images.");

    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "Partite");
    assert.equal(await page.locator(".match-card").count(), 1, "Chat preserves the existing match");
    await page.locator(".match-card").getByText("Campo test chat", { exact: true }).waitFor();
    await navigate(page, "Giocatori");
    assert.equal(await page.locator(".player-card").count(), 16, "Chat preserves the existing roster");
    assert.equal(await page.getByRole("heading", { name: "Amico chat", exact: true }).count(), 1);
    await navigate(page, "Chat");
    await assertMessageCount(page, 3);
    assert.equal(await log(page).getByRole("article", { name: "Messaggio di Amministratore", exact: true }).count(), 1);
    assert.equal(await log(page).getByRole("article", { name: "Messaggio di Trieu", exact: true }).count(), 1);
    assert.equal(await log(page).getByRole("article", { name: "Messaggio di Egor", exact: true }).count(), 1);
    assert.equal(await log(page).locator("mark.chat-mention").innerText(), "@Egor");
    assert.equal(await log(page).locator(".chat-sticker").count(), 1);

    await page.setViewportSize({ width: 390, height: 844 });
    await navigate(page, "Home", true);
    await navigate(page, "Chat", true);
    await assertMessageCount(page, 3);
    const widths = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, document: document.documentElement.scrollWidth }));
    assert.ok(widths.document <= widths.viewport + 1, `Chat has no horizontal mobile overflow: ${JSON.stringify(widths)}`);
    assert.deepEqual(errors, [], "No uncaught browser errors");
    console.log("PASS: chat and prior match/player data survive reload; desktop and mobile navigation work without overflow.");
  } finally {
    await context.close();
  }
}

async function migratedChat(browser) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    const mediaRequests = [];
    page.on("request", request => {
      if (new URL(request.url()).hostname.endsWith("giphy.com") || new URL(request.url()).hostname === "removed-media.example") mediaRequests.push(request.url());
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    await prepareExistingData(page);
    const previous = await page.evaluate(() => {
      const key = "calcetto-preview-v1";
      const data = JSON.parse(localStorage.getItem(key));
      data.players[0].photo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1WQAAAAASUVORK5CYII=";
      const base = { authorId: "trieu", createdAt: "2026-10-19T10:00:00Z", mentionIds: [] };
      data.messages = [
        { ...base, id: "old-remote-gif", text: "Testo con GIF da conservare", attachment: { type: "gif", url: "https://media.giphy.com/media/old/giphy.gif" } },
        { ...base, id: "old-upload", text: "", attachment: { type: "gif", url: "data:image/gif;base64," + "A".repeat(12000) } },
        { ...base, id: "old-photo", text: "Testo con foto da conservare", attachment: { type: "photo", url: "https://removed-media.example/photo.jpg" } },
        { ...base, id: "old-image", text: "", attachment: { type: "image", url: "data:image/png;base64," + "B".repeat(12000) } },
        { ...base, id: "sticker", text: "", attachment: { type: "sticker", stickerId: "gol" } },
        { ...base, id: "text", text: "Messaggio normale" },
      ];
      localStorage.setItem(key, JSON.stringify(data));
      return data;
    });
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "Chat");
    await assertMessageCount(page, 6);
    assert.equal(await page.locator('.chat-shell img').count(), 0);
    assert.equal(await log(page).getByText("Allegato rimosso", { exact: true }).count(), 2);
    await log(page).getByText("Testo con GIF da conservare", { exact: true }).waitFor();
    await log(page).getByText("Testo con foto da conservare", { exact: true }).waitFor();
    const cleaned = await page.evaluate(() => JSON.parse(localStorage.getItem("calcetto-preview-v1")));
    assert.deepEqual(cleaned.matches, previous.matches);
    assert.deepEqual(cleaned.seasons, previous.seasons);
    assert.deepEqual(cleaned.players, previous.players, "Profile photos remain available outside chat");
    assert.deepEqual(cleaned.messages.map(m => [m.id, m.authorId, m.createdAt]), previous.messages.map(m => [m.id, m.authorId, m.createdAt]));
    assert(cleaned.messages.every(m => !m.attachment || m.attachment.type === "sticker"));
    assert(JSON.stringify(cleaned).length < JSON.stringify(previous).length - 20000, "Stored media bytes removed");
    assert.deepEqual(mediaRequests, [], "Old external media must never be downloaded");
    await page.reload({ waitUntil: "networkidle" });
    await navigate(page, "Chat");
    await assertMessageCount(page, 6);
    assert.equal(await log(page).getByText("Allegato rimosso", { exact: true }).count(), 2, "Migration is idempotent");
    await page.screenshot({ path: "artifacts/chat-senza-media.png", fullPage: true });
    console.log("PASS: old GIFs and photos are removed from storage without media requests; texts, metadata, stickers, profile photos and sports data survive reload.");
  } finally { await context.close(); }
}

async function temporaryChat(browser, sandbox) {
  const context = await browser.newContext({ viewport: { width: 1500, height: 1100 } });
  try {
    if (!sandbox) await context.addInitScript(() => {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() { throw new DOMException("Storage unavailable in chat regression test", "SecurityError"); },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    const errors = [];
    const blockedSubmissions = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (/Blocked form submission/i.test(message.text())) blockedSubmissions.push(message.text());
    });
    let scope = page;
    if (sandbox) {
      await page.setContent('<iframe name="chat-preview" sandbox="allow-scripts" style="width:1440px;height:1000px"></iframe>');
      await page.locator("iframe").evaluate((iframe, url) => { iframe.src = url; }, baseUrl);
      scope = page.frameLocator("iframe");
    } else {
      const response = await page.goto(baseUrl, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
    }
    await scope.getByRole("button", { name: "Crea stagione", exact: true }).waitFor();
    const failure = await scope.locator("body").evaluate(() => {
      try { return Boolean(window.localStorage) ? null : "Unavailable"; } catch (error) { return error.name; }
    });
    assert.equal(failure, "SecurityError");
    await navigate(scope, "Chat");
    await assertMessageCount(scope, 0);
    await sendText(scope, "Messaggio temporaneo", 1);
    const warning = scope.locator(".storage-warning");
    await warning.waitFor({ state: "visible" });
    assert.match(await warning.innerText(), /solo in questa sessione/i);
    await navigate(scope, "Home");
    await navigate(scope, "Chat");
    await assertMessageCount(scope, 1);
    assert.equal(await log(scope).locator(".chat-message-text").innerText(), "Messaggio temporaneo");
    await warning.waitFor({ state: "visible" });
    assert.deepEqual(blockedSubmissions, [], "Chat works without native form submission permissions");
    assert.deepEqual(errors, []);
    console.log(`PASS: ${sandbox ? "allow-scripts sandbox" : "localStorage SecurityError"} sends and retains local messages with a persistent temporary-storage warning.`);
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
    await normalChat(browser);
    await migratedChat(browser);
    await temporaryChat(browser, true);
    await temporaryChat(browser, false);
    console.log("All local chat tests passed in isolated disposable browser contexts.");
  } finally {
    await browser.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
