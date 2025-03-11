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
      const { query } = req.body;
      if (!query) return res.status(400).json({ error: "Сұрақ міндетті" });

      console.log(`🔎 Іздеу сұранысы: ${query}`);

      // 1️⃣ GPT-4 арқылы сұрақты нақтылау
      const clarificationResponse = await axios.post(
        OPENAI_URL,
        {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Сен пайдаланушы сұрағын тек негізгі кілт сөздерге дейін қысқартатын көмекшісің.  
              **Барлық қосымша сөздерді алып тастап**, тек маңызды сөздерді қалдыр.  
              **Ештеңе қоспа!** Тек негізгі сөздерден тұратын қысқа нұсқасын қайтар.  
              
              Мысалы:  
              ❌ "Маған ЖК тіркеу керек еді, не істеуім керек?" → ✅ "ЖК тіркеу"  
              ❌ "ЖК ашу үшін қандай құжаттар қажет?" → ✅ "ЖК құжаттар"  
              ❌ "Мен ИП-ны тоқтата аламын ба?" → ✅ "ИП тоқтату"  
              ❌ "Мен декларация 270 формасын алғым келеді" → ✅ "270 декларация"  
              `,
            },
            { role: "user", content: query },
          ],
          temperature: 0.1,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log(
        "🧠 Токены, использованные в запросе search:",
        clarificationResponse.data.usage.total_tokens
      );

      const clarifiedQuery =
        clarificationResponse.data.choices[0].message.content.trim();
      console.log(`✅ Нақты сұрақ: ${clarifiedQuery}`);

      const apiHost = process.env.host;

      // 2️⃣ Векторлық базаға жіберу
      const searchResult = await axios.post(`${apiHost}/pinecone/search/`, {
        query: clarifiedQuery,
      });

      res.json({ searchResult: searchResult.data });
    } catch (error) {
      console.error("❌ Іздеу қатесі:", error);
      res.status(500).json({ error: "Сервер қатесі" });
    }
  }

  // өөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөөққққққққққққққққққққққққққққққққққққққққққққққ

  async respond(req, res) {
    try {
      const { question, searchResult } = req.body;
      if (!question)
        return res.status(400).json({ error: "Вопрос обязателен" });

      console.log(`📩 Новый вопрос: "${question}"`);

      let finalAnswer = "Кешіріңіз, жауап бере алмаймын";

      if (Array.isArray(searchResult) && searchResult.length > 0) {
        const { score, metadata } = searchResult[0];
        console.log(`🔍 Score: ${score}`);

        if (score >= 0.55) {
          console.log("🎯 Высокий score, используем ответ без OpenAI");
          finalAnswer = metadata.answer;
        } else {
          console.log("🔎 Проверяем релевантность вопроса...");

          const relevanceCheckResponse = await axios.post(
            OPENAI_URL,
            {
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `Тек "YES" немесе "NO" деп жауап бер. Егер пайдаланушы сұрағы мен база сұрағы бір тақырыпта болса, "YES" деп жауап бер. Егер олар әртүрлі тақырыпта болса, "NO" деп жауап бер.`,
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

          if (openAiResponse?.toUpperCase() === "YES") {
            console.log(
              "✅ Вопрос релевантен. Используем ответ:",
              metadata.answer
            );
            finalAnswer = metadata.answer;
          }
        }
      }

      const politeResponses = {
        рахмет: "Сізге де рахмет! 😊",
        спасибо: "Рақмет! Көмектесе алсам, қуаныштымын! 🌟",
        қалайсыз: "Жақсы, рахмет! Сіз қалайсыз?",
        здравствуйте: "Сәлеметсіз бе! Қалай көмектесе аламын?",
      };

      const normalizedQuestion = question.toLowerCase().trim();
      if (politeResponses[normalizedQuestion]) {
        finalAnswer = politeResponses[normalizedQuestion];
      }

      if (Array.isArray(searchResult) && searchResult.length > 0) {
        const { score } = searchResult[0];

        if (score >= 0.55) {
          finalAnswer += `\n\nСіз осы мәселелер бойынша менеджерге жүгіне аласыз:\nМенеджер есімі Ақерке\nWhatsApp: +7 747 724 07 99`;
        } else {
          finalAnswer += `\n\nБұл автоматты ИИ асистент жауабы. Егер сізге менеджер көмегі қажет болса, жазыңыз:\nМенеджер есімі Ақерке\nWhatsApp: +7 747 724 07 99\n\nЕгер ақылы консультация алғыңыз келсе, құны 5000, төлем жасап тікелей өзіме хабарласыңыз!`;
        }
      }

      if (!finalAnswer || finalAnswer === "Кешіріңіз, жауап бере алмаймын") {
        finalAnswer =
          "Бұл автоматты ИИ асистент жауабы. Егер сізге менеджер көмегі қажет болса, жазыңыз:\nМенеджер есімі Ақерке\nWhatsApp: +7 747 724 07 99\n\nЕгер ақылы консультация алғыңыз келсе, құны 5000, төлем жасап тікелей өзіме хабарласыңыз!";
      }

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
