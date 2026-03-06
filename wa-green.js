// wa-green.js - Green API WhatsApp
const axios = require("axios");
const config = require("./config");

const API = `https://api.green-api.com/waInstance${config.GREEN_ID}`;
const TOKEN = config.GREEN_TOKEN;

async function sendText(to, text) {
  try {
    const chatId = to.includes("@") ? to : `${to}@c.us`;
    await axios.post(`${API}/sendMessage/${TOKEN}`, {
      chatId,
      message: text,
    });
  } catch (e) {
    console.error("Green sendText error:", e.response?.data || e.message);
  }
}

async function sendImage(to, imageUrl, caption) {
  try {
    const chatId = to.includes("@") ? to : `${to}@c.us`;
    await axios.post(`${API}/sendFileByUrl/${TOKEN}`, {
      chatId,
      urlFile: imageUrl,
      fileName: "tile.jpg",
      caption,
    });
  } catch (e) {
    console.error("Green sendImage error:", e.response?.data || e.message);
  }
}

async function sendProduct(to, product) {
  const caption = `${product.name_ru}\nРазмер: ${product.size}\nЦена: ${product.price} тг/м2${product.article ? "\nАрт: " + product.article : ""}`;
  if (product.image_url) {
    await sendImage(to, product.image_url, caption);
  } else {
    await sendText(to, caption);
  }
}

// Poll for incoming messages (Green API uses polling or webhook)
function parseWebhook(body) {
  try {
    if (body.typeWebhook !== "incomingMessageReceived") return null;
    const msg = body.messageData;
    const text =
      msg?.textMessageData?.textMessage ||
      msg?.extendedTextMessageData?.text ||
      "";

    return {
      from: body.senderData?.chatId?.replace("@c.us", "") || "",
      text,
      type: "text",
      timestamp: body.timestamp,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { sendText, sendImage, sendProduct, parseWebhook };
