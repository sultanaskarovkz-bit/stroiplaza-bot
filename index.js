// index.js - StroyPlaza WhatsApp Bot
const express = require("express");
const config = require("./config");
const ai = require("./ai");
const { createClient } = require("@supabase/supabase-js");

const wa = config.WA_PROVIDER === "green"
  ? require("./wa-green")
  : require("./wa-meta");

const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_KEY);
const app = express();
app.use(express.json());

const MANAGER_PHONE = "77071919008";
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

// Save lead to database
async function saveLead(type, phone, data = {}) {
  try {
    await supabase.from("leads").insert({
      type,
      phone,
      product: data.product || null,
      quantity: data.quantity || null,
      client_name: data.name || null,
      message: data.message || null,
    });
    console.log(`[LEAD] ${type} saved from ${phone}`);
  } catch (e) {
    console.error("Save lead error:", e.message);
  }
}

// Process incoming message
async function handleMessage(from, text) {
  if (!text || text.trim().length === 0) return;
  if (from === MANAGER_PHONE) return;

  if (text === "__VOICE_MESSAGE__") {
    await wa.sendText(from, "К сожалению, я не могу прослушать голосовое сообщение. Напишите, пожалуйста, текстом - и я помогу подобрать керамогранит!");
    return;
  }

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
    await wa.sendText(from, result.text);
    addToHistory(from, "assistant", result.text);
    await saveLead("order", from, result.order);
    // Notify manager via WhatsApp
    const orderMsg = `НОВАЯ ЗАЯВКА!\n\nКлиент: ${result.order.name || "не указал"}\nТелефон: +${result.order.phone || from}\nТовар: ${result.order.product}\nКоличество: ${result.order.quantity || "уточнить"}\n\nWhatsApp: wa.me/${from}`;
    await wa.sendText(MANAGER_PHONE, orderMsg);
    console.log(`[ORDER NOTIFY] sent to manager from ${from}`);
  } else if (result.type === "address") {
    await wa.sendText(from, result.text);
    addToHistory(from, "assistant", result.text);
    await saveLead("address", from, { message: "Клиент запросил адрес" });
    // Notify manager via WhatsApp
    const addrMsg = `Клиент запросил адрес магазина!\nНомер: +${from}\nWhatsApp: wa.me/${from}`;
    await wa.sendText(MANAGER_PHONE, addrMsg);
    console.log(`[ADDRESS NOTIFY] sent to manager from ${from}`);
  } else {
    await wa.sendText(from, result.text);
    addToHistory(from, "assistant", result.text);
  }

  console.log(`[OUT] ${from}: ${result.type} (${result.products?.length || 0} products)`);
}

// === ROUTES ===

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

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  if (config.WA_PROVIDER === "meta") {
    const msg = wa.parseWebhook(req.body);
    if (msg && msg.text) await handleMessage(msg.from, msg.text);
  }
});

app.post("/green-webhook", async (req, res) => {
  res.sendStatus(200);
  if (config.WA_PROVIDER === "green") {
    const msg = wa.parseWebhook(req.body);
    if (msg && msg.text) await handleMessage(msg.from, msg.text);
  }
});

app.get("/", (req, res) => {
  res.json({ status: "ok", bot: "StroyPlaza WhatsApp Bot", provider: config.WA_PROVIDER });
});

// === ADMIN PAGE - заявки для менеджера ===
app.get("/admin", async (req, res) => {
  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);

  const rows = (leads || []).map(l => {
    const time = new Date(l.created_at).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" });
    const typeBadge = l.type === "order"
      ? '<span style="background:#4CAF50;color:#fff;padding:2px 8px;border-radius:4px">ЗАЯВКА</span>'
      : '<span style="background:#2196F3;color:#fff;padding:2px 8px;border-radius:4px">АДРЕС</span>';
    return `<tr>
      <td>${time}</td>
      <td>${typeBadge}</td>
      <td><a href="https://wa.me/${l.phone}" target="_blank">+${l.phone}</a></td>
      <td>${l.client_name || "-"}</td>
      <td>${l.product || "-"}</td>
      <td>${l.quantity || "-"}</td>
      <td>${l.message || "-"}</td>
    </tr>`;
  }).join("");

  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>StroyPlaza - Заявки</title>
  <style>
    body{font-family:Arial;margin:0;padding:20px;background:#f5f5f5}
    h1{color:#333}
    table{width:100%;border-collapse:collapse;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.1)}
    th{background:#333;color:#fff;padding:12px 8px;text-align:left}
    td{padding:10px 8px;border-bottom:1px solid #eee}
    tr:hover{background:#f9f9f9}
    a{color:#2196F3}
    .refresh{display:inline-block;padding:10px 20px;background:#4CAF50;color:#fff;text-decoration:none;border-radius:4px;margin-bottom:15px}
    .count{color:#666;margin-bottom:15px}
  </style></head><body>
  <h1>StroyPlaza - Заявки и обращения</h1>
  <a class="refresh" href="/admin">Обновить</a>
  <p class="count">Показаны последние 50 записей</p>
  <table>
    <tr><th>Дата/время</th><th>Тип</th><th>Телефон</th><th>Имя</th><th>Товар</th><th>Кол-во</th><th>Сообщение</th></tr>
    ${rows || '<tr><td colspan="7" style="text-align:center;padding:30px">Заявок пока нет</td></tr>'}
  </table></body></html>`);
});

// Privacy, Terms, Data Deletion
app.get("/privacy", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Privacy - StroyPlaza</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
  <h1>Политика конфиденциальности</h1><p><strong>StroyPlaza</strong> - магазин керамогранита, Алматы, Казахстан.</p>
  <h2>Какие данные мы собираем</h2><p>При обращении через WhatsApp мы получаем ваш номер телефона и текст сообщений для обработки запроса и подбора товаров.</p>
  <h2>Как используем данные</h2><p>Данные используются исключительно для консультации по товарам и обработки заявок. Мы не передаем ваши данные третьим лицам.</p>
  <h2>Хранение данных</h2><p>Переписка хранится в течение сеанса общения и не сохраняется после его завершения.</p>
  <h2>Контакты</h2><p>+7 707 191 9008, artsignstudio.kz@gmail.com</p></body></html>`);
});

app.get("/terms", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Terms - StroyPlaza</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
  <h1>Условия использования</h1><p><strong>StroyPlaza</strong> - магазин керамогранита, Алматы, Казахстан.</p>
  <h2>Описание сервиса</h2><p>WhatsApp-бот StroyPlaza предоставляет автоматизированную консультацию по ассортименту керамогранита.</p>
  <h2>Ограничения</h2><p>Информация от бота носит справочный характер. Окончательные цены и наличие уточняйте у менеджера.</p>
  <h2>Контакты</h2><p>+7 707 191 9008, ул. Тараз 16, Алматы</p></body></html>`);
});

app.get("/data-deletion", (req, res) => {
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Data Deletion - StroyPlaza</title></head><body style="font-family:Arial;max-width:800px;margin:40px auto;padding:0 20px">
  <h1>Удаление данных</h1><p>Для удаления данных: artsignstudio.kz@gmail.com, +7 707 191 9008</p></body></html>`);
});

app.listen(config.PORT, () => {
  console.log(`\n=== StroyPlaza Bot ===`);
  console.log(`Provider: ${config.WA_PROVIDER}`);
  console.log(`Port: ${config.PORT}`);
  console.log(`Admin: /admin`);
  console.log(`Ready!\n`);
});
