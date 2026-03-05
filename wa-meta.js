// wa-meta.js - Meta WhatsApp Cloud API
const axios = require("axios");
const config = require("./config");

const API = "https://graph.facebook.com/v21.0";

async function sendText(to, text) {
  try {
    await axios.post(
      `${API}/${config.META_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      },
      { headers: { Authorization: `Bearer ${config.META_TOKEN}` } }
    );
  } catch (e) {
    console.error("Meta sendText error:", e.response?.data || e.message);
  }
}

async function sendImage(to, imageUrl, caption) {
  try {
    await axios.post(
      `${API}/${config.META_PHONE_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "image",
        image: { link: imageUrl, caption },
      },
      { headers: { Authorization: `Bearer ${config.META_TOKEN}` } }
    );
  } catch (e) {
    console.error("Meta sendImage error:", e.response?.data || e.message);
  }
}

// Send product card: photo + caption with name, size, price
async function sendProduct(to, product) {
  const caption = `${product.name_ru}\nРазмер: ${product.size}\nЦена: ${product.price} тг/шт${product.article ? "\nАрт: " + product.article : ""}`;
  if (product.image_url) {
    await sendImage(to, product.image_url, caption);
  } else {
    await sendText(to, caption);
  }
}

// Extract message from Meta webhook payload
function parseWebhook(body) {
  try {
    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;
    const msg = value?.messages?.[0];

    if (!msg) return null;

    return {
      from: msg.from,
      text: msg.text?.body || "",
      type: msg.type,
      timestamp: msg.timestamp,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { sendText, sendImage, sendProduct, parseWebhook };
