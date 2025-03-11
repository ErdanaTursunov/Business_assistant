require("dotenv").config();

const axios = require("axios");
const Message = require("../models/Message");
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const TEMPERATURE = 0.3;

class AIController {
  async analyze(req, res) {
    try {
      const { question, phoneNumber } = req.body;
      if (!question || !phoneNumber) {
        return res.status(400).json({ error: "Сұрақ міндетті түрде қажет" });
      }

      // 1️⃣ Проверяем, содержит ли вопрос только вежливость или имеет смысловую часть
      const politePhrases = [
        "сәлем",
        "салем",
        "салеметсіз бе",
        "сәлеметсіз бе",
        "қайырлы таң",
        "қайырлы күн",
        "рахмет",
        "қалайсыз",
        "қалыңыз қалай",
        "қалың қалай",
        "сізге рахмет",
        "рахмет көп көп",
        "сау болыңыз",
        "қош болыңыз",
      ];

      const lowerQuestion = question.toLowerCase().trim();
      const words = lowerQuestion.split(/\s+/);
      const containsPolitePhrase = politePhrases.some((phrase) =>
        words.includes(phrase)
      );
      const hasMeaningfulContent =
        words.length > 2 || (words.length > 1 && !containsPolitePhrase);

      if (containsPolitePhrase && !hasMeaningfulContent) {
        return res.json({ needsSearch: false });
      }

      // 2️⃣ Формируем запрос AI для анализа необходимости поиска
      const prompt = `
  Сен пайдаланушының сұрағын талдайсың.
  Міндетің – осы сұраққа жауап беру үшін векторлық дерекқордан ақпарат алу қажет пе, жоқ па, соны анықтау.
  Тек "иә" немесе "жоқ" деп жауап бер.
  
  📌 "иә" деп жауап бер, егер сұрақ ақпарат алуды білдірсе.
  ❌ "жоқ" деп жауап бер, егер сұрақ – тек амандасу, қоштасу немесе рахмет айту ғана.
  
  🔹 Пайдаланушы сұрағы: "${question}"
  `.trim();

      const response = await axios.post(
        OPENAI_URL,
        {
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: prompt }],
          temperature: TEMPERATURE,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.data.choices || response.data.choices.length === 0) {
        throw new Error("OpenAI не вернул корректный ответ");
      }

      const decision =
        response.data.choices[0]?.message?.content?.toLowerCase() || "";
      console.log({ decision });
      const needsSearch = decision.includes("иә");

      res.json({ needsSearch });
    } catch (error) {
      console.error("🚨 AI Анализатор қатесі:", error.message || error);
      res.status(500).json({ error: "Сервер қатесі" });
    }
  }

  // өөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөққққққққққққққққққққққққққққққққққққққққққққққ

  async search(req, res) {
    try {
      const { query, phoneNumber } = req.body;
      if (!query || !phoneNumber)
        return res.status(400).json({ error: "Сұрақ міндетті" });

      // 1️⃣ Пайдаланушының тарихын алу
      const history = await Message.findAll({
        where: { phone_number: phoneNumber },
        order: [["created_at", "ASC"]],
        limit: 3,
      });

      // 2️⃣ Тарихты OpenAI үшін форматтау
      const messages = history
        .map((msg) => [
          { role: "user", content: msg.message },
          { role: "assistant", content: msg.ai_response },
        ])
        .flat();

      messages.push({ role: "user", content: query });

      console.log({ search: messages });

      // 3️⃣ GPT-4 арқылы сұрақты нақты әрі дұрыс өңдеу
      const clarificationResponse = await axios.post(
        OPENAI_URL,
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Сен пайдаланушы сұрағын нақты әрі түсінікті қылып қайта жазатын көмекшісің.  
  Сұрақтың негізгі мәнін сақта, бірақ оны **қысқа әрі анық** ет.  
  **Сұраулы сөйлемдер жасама.** Пайдаланушының атынан нақты сұрақты қайта жаз.  
  Жауап ретінде тек түзетілген сұрақты қайтар. Мысалы : "Сәлеметсіз бе, маған декларация формасы керек еді 270"	=>"270 декларация формасы"
  "ЖК тіркеу үшін қандай құжаттар керек?" =>	"ЖК ашу үшін қажет құжаттар"
  "Мүлікті аресттен қалай алып тастауға болады?" =>	"Мүліктен арестті алып тастау"`,
            },
            ...messages, // Тарихты есепке аламыз
          ],
          temperature: 0.1, // Жауапты тұрақты ету үшін
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        "Токены, использованные в запросе search :",
        clarificationResponse.data.usage.total_tokens
      );
      const clarifiedQuery =
        clarificationResponse.data.choices[0].message.content.trim();
      console.log(`Нақтыланған сұрақ: ${clarifiedQuery}`);

      const apiHost = process.env.host;
      // 4️⃣ Векторлық базаға жіберу
      const pineconeResponse = await axios.post(`${apiHost}/pinecone/search/`, {
        query: clarifiedQuery, // Түзетілген сұрақты жібереміз
      });

      const searchResult = pineconeResponse.data;

      res.json({ searchResult });
    } catch (error) {
      console.error("Іздеу қатесі:", error);
      res.status(500).json({ error: "Сервер қатесі" });
    }
  }

  // өөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөққққққққққққққққққққққққққққққққққққққққққққққ

  async respond(req, res) {
    try {
      const { question, searchResult, phoneNumber } = req.body;
      if (!question)
        return res.status(400).json({ error: "Вопрос обязателен" });

      console.log(`📩 Новый вопрос: "${question}" от ${phoneNumber}`);

      // Загружаем последние 2 сообщения
      const history = await Message.findAll({
        where: { phone_number: phoneNumber },
        order: [["created_at", "ASC"]],
        limit: 2,
      });

      // Формируем историю сообщений
      const messages = history.flatMap((msg) => [
        { role: "user", content: msg.message },
        { role: "assistant", content: msg.ai_response },
      ]);
      messages.push({ role: "user", content: question });

      // Шаблонный ответ, если ничего не найдено
      const templateAnswer = `Бұл автоматты ИИ асистент жауабы. Егер сізге Айдана Асқарқызы көмегі қажет болса немесе консультация қажет болса, менеджерге жазыңыз:
      Менеджер: Ақерке
      WhatsApp: +7 747 724 0799
      (Ақылы консультация – 5000, төлем жасап, тікелей байланысыңыз.)`;

      let finalAnswer = "Кешіріңіз, жауап бере алмаймын";

      // Проверяем наличие результата
      if (Array.isArray(searchResult) && searchResult.length > 0) {
        const { score, metadata } = searchResult[0];
        console.log(`🔍 Score: ${score}`);

        if (score >= 0.7) {
          // Если score выше 0.7, берем ответ сразу без OpenAI
          console.log("🎯 Высокий score, используем ответ без OpenAI");
          finalAnswer = metadata.answer;
        } else {
          console.log(`🔎 Проверяем релевантность вопроса...`);

          // Проверяем схожесть с помощью GPT
          const relevanceCheckResponse = await axios.post(
            OPENAI_URL,
            {
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `⚠️ Назар аударыңыз!  
  Сізге екі сөйлем беріледі:  
  1. Пайдаланушының сұрағы  
  2. Дерекқордағы сұрақ  
  - Егер олар бір тақырыпқа байланысты болса (тіпті сұрау форматы әртүрлі болса да), "YES" деп жауап беріңіз.  
  - Егер олар мүлдем басқа нәрсе туралы болса, "NO" деп жауап беріңіз.  
  Тек "YES" немесе "NO" деп жауап беріңіз, басқа ештеңе жазбаңыз!`,
                },
                {
                  role: "user",
                  content: `Пайдаланушының сұрағы: ${question}\nДерекқордағы сұрақ: ${metadata.text}`,
                },
              ],
              temperature: 0,
            },
            {
              headers: {
                Authorization: `Bearer ${OPENAI_API_KEY}`,
                "Content-Type": "application/json",
              },
            }
          );

          const openAiResponse =
            relevanceCheckResponse?.data?.choices?.[0]?.message?.content?.trim();

          console.log(`🧠 Ответ от OpenAI: "${openAiResponse}"`);

          const isRelevant = openAiResponse?.toUpperCase() === "YES";

          if (typeof isRelevant === "undefined") {
            console.log(
              "⚠️ OpenAI не дал ответа. Считаем релевантным по умолчанию."
            );
            finalAnswer = metadata.answer;
          } else if (isRelevant) {
            console.log(
              "✅ Вопрос релевантен. Используем ответ:",
              metadata.answer
            );
            finalAnswer = metadata.answer;
          } else {
            console.log("❌ Вопрос не совпадает. Отправляем шаблон.");
            finalAnswer = templateAnswer;
          }
        }
      } else {
        console.log("❌ Ничего не найдено в базе. Отправляем шаблон.");
        finalAnswer = templateAnswer;
      }

      // Если в ответе есть ключевые слова, добавляем инфо о менеджере
      const serviceKeywords = [
        "құжат",
        "жәрдемақы",
        "ипотека",
        "грант",
        "бизнес-жоспар",
        "субсидия",
        "страховка",
        "зейнетақы",
      ];
      if (
        serviceKeywords.some((word) => finalAnswer.toLowerCase().includes(word))
      ) {
        finalAnswer +=
          "\n\n📌 Толық ақпарат және қызметке жазылу үшін менің менеджеріме жазыңыз: Ақерке, WhatsApp: +7 747 724 0799.";
      }

      // Удаляем старые сообщения, если их больше 3
      const userMessagesCount = await Message.count({
        where: { phone_number: phoneNumber },
      });

      if (userMessagesCount >= 4) {
        const oldMessages = await Message.findAll({
          where: { phone_number: phoneNumber },
          order: [["created_at", "ASC"]],
          limit: userMessagesCount - 3,
        });

        await Message.destroy({
          where: { id: oldMessages.map((msg) => msg.id) },
        });
      }

      // Сохраняем новый диалог
      await Message.create({
        phone_number: phoneNumber,
        message: question,
        ai_response: finalAnswer,
      });

      console.log("📤 Отправлен ответ:", finalAnswer);
      return res.json({ response: finalAnswer });
    } catch (error) {
      console.error("🚨 Ошибка:", error);
      return res.status(500).json({ error: "Ошибка сервера" });
    }
  }

  // өөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөққққққққққққққққққққққққққққққққққққққққққққққ

  async process(req, res) {
    try {
      const { question, phoneNumber } = req.body;
      if (!question || !phoneNumber) {
        return res
          .status(400)
          .json({ error: "Сұрақ пен телефон нөмірі қажет" });
      }

      const apiHost = process.env.host; // Убедись, что `HOST` задан в .env
      console.log(apiHost);

      // 1️⃣ Ищем в векторной базе
      const searchResponse = await axios.post(`${apiHost}/ai/search`, {
        query: question,
        phoneNumber,
      });

      console.log("🔎 Search Result:", searchResponse.data);
      const searchResult = searchResponse.data.searchResult || [];

      // 2️⃣ Получаем финальный ответ
      const respondResponse = await axios.post(`${apiHost}/ai/respond`, {
        question,
        searchResult,
        phoneNumber,
      });

      console.log("💬 Final Response:", respondResponse.data);
      res.json({ response: respondResponse.data.response });
    } catch (error) {
      console.error("🚨 Process Error:", error.message);
      res.status(500).json({ error: "Сервер қатесі" });
    }
  }
}

module.exports = new AIController();
