// require("dotenv").config();
// const axios = require("axios");
// const openaiApiKey = process.env.OPENAI_API_KEY;

// class AIAssistant {
//   constructor() {
//     this.getOpenAIResponse = this.getOpenAIResponse.bind(this);
//     this.handleUserQuery = this.handleUserQuery.bind(this);
//   }

//   // Запрос в OpenAI
//   async getOpenAIResponse(query) {
//     try {
//       const messages = [
//         {
//           role: "system",
//           content: `Ты — виртуальный ассистент по продаже юридических услуг в Казахстане. Твоя основная задача — дружелюбно и профессионально представлять услуги, отвечать на вопросы клиентов и помогать им выбрать подходящий вариант.
//       ### *Основные правила общения:*
//       1. *Язык:*
//          - Если пользователь пишет на казахском, отвечай на казахском.
//          - Если пользователь пишет на русском, переводи данные из базы и отвечай на русском.
//       2. *Тон общения:*
//          - Всегда вежливый, дружелюбный и профессиональный.
//          - Объясняй просто и понятно, избегая сложных юридических терминов.
//       3. *Как отвечать:*
//          - Если запрос пользователя соответствует услуге из базы, дай полное описание услуги.
//          - Если в базе нет информации по запросу, скажи, что не понял вопрос, и попроси уточнить. Не придумывай ответов.
//          - Если пользователь спрашивает, как что-то сделать самостоятельно, мягко направляй его на соответствующую услугу.
//       ### *Примеры ответов:*
//       *Если услуга найдена:*
//       Сәлеметсіз бе! Біз ипотекалық сүйемелдеу қызметтерін ұсынамыз. [Описание услуги из базы]. Сізге осы қызмет қажет пе?
//       *Если услуга найдена (на русском):*
//       Здравствуйте! Мы предоставляем услуги по сопровождению ипотеки. [Описание услуги из базы]. Вам подходит этот вариант?
//       *Если услуга не найдена:*
//       "Кешіріңіз, мен сұранысыңызды толық түсінбедім. Қандай қызмет туралы сұрап тұрғаныңызды нақтылай аласыз ба?"
//       "Извините, я не совсем понял ваш вопрос. Можете уточнить, какая именно услуга вас интересует?"
//       Твоя цель — сделать процесс общения максимально удобным и помочь клиенту найти нужную услугу`,
//         },
//         { role: "user", content: query },
//       ];

//       const response = await axios.post(
//         "https://api.openai.com/v1/chat/completions",
//         {
//           model: "gpt-4-turbo",
//           messages,
//           max_tokens: 200, // Достаточно для четкого ответа
//         },
//         {
//           headers: {
//             Authorization: `Bearer ${openaiApiKey}`,
//             "Content-Type": "application/json",
//           },
//         }
//       );

//       return response.data.choices[0].message.content.trim();
//     } catch (error) {
//       console.error("Ошибка OpenAI:", error.message);
//       return "Не знаю, сорри!";
//     }
//   }

//   // Обрабатываем запрос пользователя
//   async handleUserQuery(req, res) {
//     try {
//       const { query } = req.body;

//       if (!query) {
//         return res.status(400).json({ error: "Введите поисковый запрос" });
//       }

//       console.log("🔍 Поиск в Pinecone...");
//       console.log({ query });

//       // Запрос к локальному API Pinecone
//       const response = await axios.post(
//         "http://localhost:4000/pinecone/search",
//         { query }
//       );

//       const databaseResults = response.data; // Получаем массив найденных результатов

//       if (databaseResults.length > 0 && databaseResults[0].metadata?.answer) {
//         console.log(
//           "✅ Найдено в базе! Улучшаем ответ через OpenAI...",
//           databaseResults
//         );

//         // Объединяем все найденные ответы
//         const combinedAnswers = databaseResults
//           .map((res) => res.metadata.answer) // Берем answer, а не text
//           .join("\n");

//         // Улучшаем ответ с помощью OpenAI
//         const improvedAnswer = await this.getOpenAIResponse(
//           phoneNumber, // Добавил phoneNumber, чтобы функция работала корректно
//           `Вопрос: "${query}" \n\nНайденная информация:\n${combinedAnswers} \n\nОтветь кратко, но понятно.`
//         );

//         return res
//           .status(200)
//           .json({ source: "Pinecone + OpenAI", answer: improvedAnswer });
//       }

//       // Если в базе данных ничего не найдено, используем OpenAI
//       console.log("❌ Не найдено в базе, создаем ответ через OpenAI...");
//       const fallbackResponse = await this.getOpenAIResponse(
//         `Человек спросил: "${query}".
//         Этой информации нет в базе. Дай короткий и естественный ответ, предложи уточнить детали, если нужно.`
//       );

//       return res
//         .status(200)
//         .json({ source: "OpenAI", answer: fallbackResponse });
//     } catch (error) {
//       console.error("❌ Ошибка:", error.message);
//       return res
//         .status(500)
//         .json({ message: "Ошибка в обработке запроса", error: error.message });
//     }
//   }
// }

// module.exports = new AIAssistant();

require("dotenv").config();
const axios = require("axios");
const Message = require("../models/Message");

const openaiApiKey = process.env.OPENAI_API_KEY;

class AIAssistant {
  constructor() {
    this.getOpenAIResponse = this.getOpenAIResponse.bind(this);
    this.handleUserQuery = this.handleUserQuery.bind(this);
  }

  // Получаем последние 5 сообщений пользователя
  async getLastMessages(phoneNumber) {
    try {
      const messages = await Message.findAll({
        where: { phone_number: phoneNumber }, // Исправлено на корректное имя поля
        order: [["created_at", "DESC"]], // Исправлено на корректное имя поля
        limit: 5,
      });

      return messages.map((msg) => ({
        content: msg.message,
      }));
    } catch (error) {
      console.error("Ошибка получения сообщений:", error.message);
      return [];
    }
  }

  // Отправка запроса в OpenAI
  async getOpenAIResponse(phoneNumber, userMessage) {
    try {
      const previousMessages = await this.getLastMessages(phoneNumber);

      console.log({ "Чат пользователя": previousMessages });

      // Проверяем, упоминал ли пользователь свое имя ранее
      let userName = null;
      const namePattern = /(?:Менің атым|Меня зовут) ([\p{L}]+)/iu; // Поддержка казахских, русских букв

      for (const msg of previousMessages) {
        const match = msg.content.match(namePattern);
        if (match) {
          userName = match[1];
          break;
        }
      }

      const systemMessage = {
        role: "system",
        content: `Сен – Қазақстандағы заңгерлік қызметтерді сатуға арналған виртуалды көмекшісің. Сенің негізгі мақсатың – қызметтерді кәсіби түрде таныстыру, клиенттердің сұрақтарына жауап беру және оларға сәйкес келетін нұсқаны таңдауға көмектесу.
      
        ### *Қарым-қатынас ережелері:*
        1. *Тіл:*
           - Егер пайдаланушы қазақша жазса, қазақша жауап беріңіз.
      
        2. *Қарым-қатынас стилі:*
           - Әрқашан сыпайы, достық қарым-қатынаста және кәсіби болыңыз.
           - Қиын заң терминдерінен аулақ болып, қарапайым және түсінікті етіп түсіндіріңіз.
      
        3. *Қалай жауап беру керек:*
           - Егер пайдаланушының сұранысы базаға сәйкес келсе, қызмет туралы толық ақпарат беріңіз.
           - Егер база бойынша ақпарат болмаса, сұранысты түсінбегеніңізді айтыңыз және нақтылауды сұраңыз. Жауапты ойдан шығарманыз.
           - Егер пайдаланушы қандай да бір әрекетті өзі жасағысы келсе, оны сәйкес қызметке жұмсақ түрде бағыттаңыз.
      
        ### *Жауап үлгілері:*
        *Егер қызмет табылса:*
        "Сәлеметсіз бе! Біз ипотекалық сүйемелдеу қызметтерін ұсынамыз. [Қызметтің сипаттамасы]. Сізге осы қызмет қажет пе?"
      
        *Егер қызмет табылмаса:*
        "Кешіріңіз, мен сұранысыңызды толық түсінбедім. Қандай қызмет туралы сұрап тұрғаныңызды нақтылай аласыз ба?"
      
        Сіздің мақсатыңыз – қарым-қатынасты барынша ыңғайлы етіп, клиентке қажетті қызметті табуға көмектесу.`,
      };

      const messages = [
        systemMessage, // Оставляем без массива
        ...previousMessages.map((msg) => ({
          role: "user",
          content: msg.content,
        })),
        { role: "user", content: userMessage },
      ];
      

      // Если знаем имя пользователя, добавляем в ответ
      if (userName) {
        messages.push({
          role: "assistant",
          content: `Иә, мен сенің атыңды білемін, ${userName}!`,
        });
      }

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4-turbo",
          messages,
        },
        {
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error("Ошибка OpenAI:", error.message);
      return "Извините, возникла ошибка. Попробуйте позже.";
    }
  }

  // Обрабатываем запрос пользователя
  async handleUserQuery(req, res) {
    try {
      const { phoneNumber, query } = req.body;

      if (!query || !phoneNumber) {
        return res.status(400).json({ error: "Введите номер и сообщение" });
      }

      console.log(`🔍 Запрос от ${phoneNumber}: "${query}"`);

      // Запрос к базе Pinecone
      const response = await axios.post(
        "http://localhost:4000/pinecone/search",
        { query }
      );

      const databaseResults = response.data;

      console.log({ databaseResults: databaseResults });

      if (databaseResults.length > 0 && databaseResults[0].metadata?.text) {
        console.log("✅ Найдено в базе! Улучшаем ответ через OpenAI...");

        const combinedAnswers = databaseResults
          .map((res) => res.metadata.answer)
          .join("\n");

        const improvedAnswer = await this.getOpenAIResponse(
          phoneNumber,
          `Вопрос: "${query}"\n\nНайденная информация:\n${combinedAnswers}`
        );

        return res
          .status(200)
          .json({ source: "Pinecone + OpenAI", answer: improvedAnswer });
      }

      // Если в базе Pinecone ничего не найдено, все равно отправляем запрос в OpenAI
      console.log("❌ Не найдено в базе, создаем ответ через OpenAI...");
      const fallbackResponse = await this.getOpenAIResponse(phoneNumber, query);

      return res
        .status(200)
        .json({ source: "OpenAI", answer: fallbackResponse });
    } catch (error) {
      console.error("❌ Ошибка:", error.message);
      return res.status(500).json({ message: "Ошибка обработки запроса" });
    }
  }
}

module.exports = new AIAssistant();
