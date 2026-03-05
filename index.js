// index.js - StroiPlaza WhatsApp Bot
const express = require("express");
const config = require("./config");
const ai = require("./ai");

const wa = config.WA_PROVIDER === "green"
  ? require("./wa-green")
  : require("./wa-meta");

const app = express();
app.use(express.json());

// Номер менеджера для заявок
const MANAGER_PHONE = "77071919008";

// In-memory chat history
const chatHistory = {};

function getHistory(phone) {
  if (!chatHistory[phone]) chatHistory[phone] = [];
  return chatHistory[phone];
}

function addToHistory(phone, role, content) {
  const history = getHistory(phone);
  history.push({ role, content });
  if (history.length > 10) history.splice(0, history.length - 10);
}

// Send order notification to manager
async function notifyManager(from, order) {
  const text = `🔔 НОВАЯ ЗАЯВКА!\n\nКлиент: ${order.name || "не указал"}\nТелефон: ${order.phone || from}\nТовар: ${order.product}\nКоличество: ${order.quantity || "уточнить"}\n\nНомер чата: ${from}`;
  await wa.sendText(MANAGER_PHONE, text);
  console.log(`[ORDER] Заявка отправлена менеджеру от ${from}`);
}

// Process incoming message
async function handleMessage(from, text) {
  if (!text || text.trim().length === 0) return;

  // Ignore messages from manager number to avoid loops
  if (from === MANAGER_PHONE) return;

  console.log(`[IN] ${from}: ${text}`);
  addToHistory(from, "user", text);

  const result = await ai.processMessage(text, getHistory(from));

  if (result.type === "products" && result.products?.length > 0) {
    await wa.sendText(from, result.text);
    addToHistory(from, "assistant", result.text);

    const toSend = result.products.slice(0, 5);
    for (const product of toSend) {
      await wa.sendProduct(from, product);
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (result.products.length > 5) {
      await wa.sendText(from, `Еще ${result.products.length - 5} вариантов. Уточните запрос, чтобы сузить выбор.`);
    }
  } else if (result.type === "order" && result.order) {
    // Send confirmation to client
    await wa.sendText(from, result.text);
    addToHistory(from, "assistant", result.text);

    // Send order to manager
    await notifyManager(from, result.order);
  } else {
    await wa.sendText(from, result.text);
    addToHistory(from, "assistant", result.text);
  }

  console.log(`[OUT] ${from}: ${result.type} (${result.products?.length || 0} products)`);
}

// === ROUTES ===

// Meta webhook verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === config.META_VERIFY_TOKEN) {
    console.log("Webhook verified");
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Meta incoming messages
app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  if (config.WA_PROVIDER === "meta") {
    const msg = wa.parseWebhook(req.body);
    if (msg && msg.text) {
      await handleMessage(msg.from, msg.text);
    }
  }
});

// Green API webhook
app.post("/green-webhook", async (req, res) => {
  res.sendStatus(200);

  if (config.WA_PROVIDER === "green") {
    const msg = wa.parseWebhook(req.body);
    if (msg && msg.text) {
      await handleMessage(msg.from, msg.text);
    }
  }
});

// Health check
app.get("/", (req, res) => {
  res.json({ status: "ok", bot: "StroiPlaza WhatsApp Bot", provider: config.WA_PROVIDER });
});

app.listen(config.PORT, () => {
  console.log(`\n=== StroiPlaza Bot ===`);
  console.log(`Provider: ${config.WA_PROVIDER}`);
  console.log(`Port: ${config.PORT}`);
  console.log(`Manager: ${MANAGER_PHONE}`);
  console.log(`Ready!\n`);
});
