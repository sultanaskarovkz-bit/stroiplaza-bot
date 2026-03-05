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

    const toSend = result.products.slice(0, 8);
    for (const product of toSend) {
      await wa.sendProduct(from, product);
      await new Promise((r) => setTimeout(r, 1000));
    }

    if (result.products.length > 8) {
      const left = result.products.length - 8;
      const word = left === 1 ? "вариант" : left < 5 ? "варианта" : "вариантов";
      await wa.sendText(from, `Еще ${left} ${word}. Уточните запрос, чтобы сузить выбор.`);
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

// Privacy Policy
app.get("/privacy", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Privacy Policy - StroiPlaza</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
  <h1>Политика конфиденциальности</h1><p><strong>StroiPlaza</strong> - магазин керамогранита, Алматы, Казахстан.</p>
  <h2>Какие данные мы собираем</h2><p>При обращении через WhatsApp мы получаем ваш номер телефона и текст сообщений для обработки запроса и подбора товаров.</p>
  <h2>Как используем данные</h2><p>Данные используются исключительно для консультации по товарам и обработки заявок. Мы не передаем ваши данные третьим лицам.</p>
  <h2>Хранение данных</h2><p>Переписка хранится в течение сеанса общения и не сохраняется после его завершения.</p>
  <h2>Контакты</h2><p>По вопросам обработки данных: +7 707 191 9008, artsignstudio.kz@gmail.com</p>
  <p>Дата обновления: март 2026</p></body></html>`);
});

// Terms of Service
app.get("/terms", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Terms - StroiPlaza</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
  <h1>Условия использования</h1><p><strong>StroiPlaza</strong> - магазин керамогранита, Алматы, Казахстан.</p>
  <h2>Описание сервиса</h2><p>WhatsApp-бот StroiPlaza предоставляет автоматизированную консультацию по ассортименту керамогранита. Бот помогает подобрать плитку и оформить заявку.</p>
  <h2>Ограничения</h2><p>Информация от бота носит справочный характер. Окончательные цены и наличие уточняйте у менеджера. Фото могут отличаться от реального товара.</p>
  <h2>Контакты</h2><p>Телефон: +7 707 191 9008</p><p>Адрес: ул. Тараз 16, Алматы</p>
  <p>Дата обновления: март 2026</p></body></html>`);
});

// Data Deletion
app.get("/data-deletion", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Data Deletion - StroiPlaza</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
  <h1>Удаление данных</h1>
  <p>Для удаления ваших данных свяжитесь с нами:</p>
  <p>Email: artsignstudio.kz@gmail.com</p><p>Телефон: +7 707 191 9008</p>
  <p>Мы удалим все связанные с вами данные в течение 30 дней.</p></body></html>`);
});

app.listen(config.PORT, () => {
  console.log(`\n=== StroiPlaza Bot ===`);
  console.log(`Provider: ${config.WA_PROVIDER}`);
  console.log(`Port: ${config.PORT}`);
  console.log(`Manager: ${MANAGER_PHONE}`);
  console.log(`Ready!\n`);
});
