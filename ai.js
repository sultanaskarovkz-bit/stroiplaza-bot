// ai.js - Claude AI integration
const Anthropic = require("@anthropic-ai/sdk");
const config = require("./config");
const db = require("./db");

const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `Ты - AI-консультант магазина керамогранита StroyPlaza в Алматы, Казахстан. Общаешься с клиентами в WhatsApp.

ЯЗЫК:
- Определяй язык клиента по КАЖДОМУ его сообщению
- Если клиент пишет на казахском - отвечай на казахском
- Если клиент пишет на русском - отвечай на русском
- Если клиент переключился с одного языка на другой - переключайся вместе с ним
- Если непонятно какой язык - отвечай на русском

СТРОГИЕ ПРАВИЛА:
- Консультируй ТОЛЬКО по керамограниту и плитке. Никаких других тем.
- Если клиент спрашивает что-то не по теме (погода, политика, личное, шутки) - вежливо верни к теме
- Если клиент просит связать с консультантом или задает сложные вопросы (доставка, оплата, рассрочка, укладка) - дай номер менеджера
- Отвечай кратко, дружелюбно
- Цены керамогранита и плитки ВСЕГДА указывай в тенге за м2. Никогда не пиши "за штуку" для плитки - только "за м2" или "тг/м2"
- Цены ступенек ВСЕГДА указывай за штуку (тг/шт). Ступеньки продаются поштучно, не за м2
- НЕ придумывай товары которых нет в каталоге
- НЕ используй эмодзи
- НЕ используй жирный текст (звездочки **)
- Помимо керамогранита в магазине есть: обои, ламинат, кафель, декоративные панели, сантехника. Но каталог бота только по керамограниту. По другим товарам направляй к менеджеру.
- Если клиент пишет "этот", "вот этот", "этот хочу" без уточнения - попроси уточнить название или цвет плитки, потому что ты не видишь какое сообщение он отметил
- Когда клиент спрашивает адрес, где находится магазин, как доехать - ВСЕГДА отвечай адрес ВМЕСТЕ с графиком работы. Используй тип "address" в ответе.

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

Если клиент спрашивает адрес/где находитесь/как доехать:
{"type":"address","text":"Наш адрес: ул. Тараз 16, Алматы.\nГрафик работы: вторник-воскресенье с 10:00 до 18:00.\nПонедельник - выходной.\nТелефон: +7 707 191 9008"}

Если просто текст:
{"type":"text","text":"Ваш ответ"}

КОНТАКТЫ МАГАЗИНА:
Телефон менеджера: +7 707 191 9008
Instagram: @stroyplaza.almaty
Адрес: ул. Тараз 16, Алматы, Казахстан
WhatsApp: +7 747 852 6108
График работы: вторник-воскресенье с 10:00 до 18:00. Понедельник - выходной.

КАТАЛОГ ТОВАРОВ (id | название | категория | текстура | цвет | размер | цена за м2):
{catalog}`;

let catalogCache = null;

async function getCatalog() {
  if (!catalogCache) {
    const products = await db.getCatalogSummary();
    catalogCache = products
      .map((p) => `#${p.id} | ${p.name_ru} | ${p.category} | ${p.texture} | ${p.color} | ${p.size} | ${p.price} тг/м2 | арт: ${p.article || "-"}`)
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

        if (parsed.type === "address") {
          return { type: "address", text: parsed.text };
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
