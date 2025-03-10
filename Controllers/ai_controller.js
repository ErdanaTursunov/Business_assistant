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

      const history = await Message.findAll({
        where: { phone_number: phoneNumber },
        order: [["created_at", "ASC"]],
        limit: 2,
      });

      const messages = history
        .map((msg) => [
          { role: "user", content: msg.message },
          { role: "assistant", content: msg.ai_response },
        ])
        .flat();

      messages.push({ role: "user", content: question });

      let finalAnswer = "Кешіріңіз, жауап бере алмаймын";

      if (searchResult && searchResult.length > 0) {
        const answerFromDB = searchResult[0].metadata.answer;

        console.log(answerFromDB);

        // GPT-4 переформулирует ответ из базы
        const refinedResponse = await axios.post(
          OPENAI_URL,
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `⚠️ Назар аударыңыз!  
                            **Сіз жауаптарды интернеттен іздемеуіңіз керек!**  
                            Сіздің міндетіңіз – **дерекқордағы дайын жауапты ғана жақсарту**.  
                            - Егер дерекқорда жауап болса, оны тек табиғи түрде қайта жазыңыз.  
                            - **Жаңа ақпарат ойлап таппаңыз**.  
                            - **"Қосымша ақпарат алу үшін мамандарға хабарласыңыз" дегенді қажетсіз жазбаңыз**, тек егер бұл ақпарат шынымен керек болса.`,
              },
              ...messages,
              { role: "assistant", content: answerFromDB },
            ],
            temperature: 0.2,
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );

        console.log("respond", refinedResponse.data.usage.total_tokens);
        finalAnswer = refinedResponse.data.choices[0].message.content.trim();
      } else {
        // Если ответа в базе нет, GPT-4 должен уточнить вопрос, а не отвечать из интернета
        const clarificationResponse = await axios.post(
          OPENAI_URL,
          {
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content: `❌ **Интернеттен ақпарат іздемеңіз!**  
                            Егер сұраққа нақты жауап болмаса, **пайдаланушыдан қосымша ақпарат сұраңыз**.  
                            **Жаңа ақпарат ойлап таппаңыз**  
                             
                             **Егер сен білмейтін сұрақтар болса әлде консультацияға жазылғысы келсе немесе қызметті алғысы келсе - шаблонды ғана жауапқа жібер.**  
                             **Шаблон: Толық ақпарат және қызметке жазылу үшін менің менеджеріме жазыңыз:  
                             Менеджердің аты Ақерке  
                             WhatsApp: +7 747 724 0799  
                             Сізге көмектесуге қуаныштымыз!**.`,
              },
              ...messages,
            ],
            temperature: 0.2,
          },
          {
            headers: {
              Authorization: `Bearer ${OPENAI_API_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log("respond", clarificationResponse.data.usage.total_tokens);

        finalAnswer =
          clarificationResponse.data.choices[0].message.content.trim();
      }

      // 🔍 Проверяем, связан ли ответ с услугами
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
      const mentionsService = serviceKeywords.some((keyword) =>
        finalAnswer.toLowerCase().includes(keyword)
      );

      if (mentionsService) {
        finalAnswer +=
          "\n\n📌 Толық ақпарат және қызметке жазылу үшін менің менеджеріме жазыңыз: Ақерке, WhatsApp: +7 747 724 0799.";
      }

      // Если сообщений больше 10, удаляем старые
      const userMessagesCount = await Message.count({
        where: { phone_number: phoneNumber },
      });

      if (userMessagesCount >= 10) {
        await Message.destroy({
          where: { phone_number: phoneNumber },
          order: [["created_at", "ASC"]],
          limit: userMessagesCount - 9, // Удаляем всё, оставляя только 9 последних
        });
      }

      // Сохраняем в базу новый вопрос и ответ
      await Message.create({
        phone_number: phoneNumber,
        message: question,
        ai_response: finalAnswer,
      });

      res.json({ response: finalAnswer });
    } catch (error) {
      console.error("🚨 Ошибка:", error);
      res.status(500).json({ error: "Ошибка сервера" });
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

      // 1️⃣ Анализируем вопрос
      const analyzeResponse = await axios.post(`${apiHost}/ai/analyze`, {
        question,
        phoneNumber,
      });
      console.log("🔍 Analyze Result:", analyzeResponse.data);

      let searchResult = [];
      if (analyzeResponse.data.needsSearch) {
        // 2️⃣ Если нужен поиск, ищем в векторной базе
        const searchResponse = await axios.post(`${apiHost}/ai/search`, {
          query: question,
          phoneNumber,
        });

        console.log("🔎 Search Result:", searchResponse.data);
        searchResult = searchResponse.data.searchResult;
      }

      // 3️⃣ Получаем финальный ответ
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
