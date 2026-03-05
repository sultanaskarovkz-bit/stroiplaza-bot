// ai.js - Claude AI integration
const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");
const db = require("./db");

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ты - AI-консультант магазина керамогранита StroyPlaza в Алматы, Казахстан. Общаешься с клиентами в WhatsApp.

СТРОГИЕ ПРАВИЛА:
- Консультируй ТОЛЬКО по керамограниту и плитке. Никаких других тем.
- Если клиент спрашивает что-то не по теме (погода, политика, личное, шутки) - вежливо верни к теме: "Я консультант по керамограниту, могу помочь с выбором плитки. Что вас интересует?"
- Если клиент просит связать с консультантом или задает сложные вопросы (доставка, оплата, рассрочка, укладка) - дай номер менеджера
- Отвечай кратко, дружелюбно, по-русски
- Цены в тенге за штуку
- НЕ придумывай товары которых нет в каталоге
- Помимо керамогранита в магазине есть: обои, ламинат, кафель, декоративные панели, сантехника. Но каталог бота только по керамограниту. По другим товарам направляй к менеджеру.

СБОР ЗАЯВКИ:
Когда клиент определился с выбором или говорит что хочет заказать/купить, собери заявку:
1. Какая плитка (название, артикул)
2. Количество (сколько кв.м. или штук)
3. Имя клиента
4. Номер телефона (если отличается от текущего чата)

Когда заявка собрана, ответь в JSON:
{"type":"order","text":"Спасибо! Ваша заявка принята. Менеджер свяжется с вами в ближайшее время.","order":{"product":"название плитки","quantity":"кол-во","name":"имя","phone":"номер"}}

ФОРМАТ ОТВЕТА:
Если нужно показать товары:
{"type":"products","ids":[1,2,3],"text":"Вот подходящие варианты:"}

Если просто текст:
{"type":"text","text":"Ваш ответ"}

КОНТАКТЫ МАГАЗИНА:
Телефон менеджера: +7 707 191 9008
Instagram: @stroyplaza.almaty
Адрес: ул. Тараз 16, Алматы, Казахстан
WhatsApp: +7 747 852 6108

КАТАЛОГ ТОВАРОВ (id | название | категория | текстура | цвет | размер | цена):
{catalog}`;

let catalogCache = null;

async function getCatalog() {
  if (!catalogCache) {
    const products = await db.getCatalogSummary();
    catalogCache = products
      .map((p) => `#${p.id} | ${p.name_ru} | ${p.category} | ${p.texture} | ${p.color} | ${p.size} | ${p.price} тг | арт: ${p.article || "-"}`)
      .join("\n");
    setTimeout(() => { catalogCache = null; }, 30 * 60 * 1000);
  }
  return catalogCache;
}

async function processMessage(userMessage, chatHistory = []) {
  const catalog = await getCatalog();
  const systemPrompt = SYSTEM_PROMPT.replace("{catalog}", catalog);

  const messages = [
    ...chatHistory.slice(-6),
    { role: "user", content: userMessage },
  ];

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: systemPrompt,
      messages,
    });

    const text = response.content[0].text.trim();

    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (parsed.type === "products" && parsed.ids?.length > 0) {
          const products = await db.getProductsByIds(parsed.ids);
          return { type: "products", text: parsed.text || "Вот подходящие варианты:", products };
        }

        if (parsed.type === "order" && parsed.order) {
          return { type: "order", text: parsed.text, order: parsed.order };
        }

        return { type: "text", text: parsed.text || text };
      }
    } catch (e) {}

    return { type: "text", text };
  } catch (error) {
    console.error("Claude API error:", error.message);
    return {
      type: "text",
      text: "Извините, произошла ошибка. Позвоните менеджеру: +7 707 191 9008",
    };
  }
}

module.exports = { processMessage };
