require("dotenv").config();
const axios = require("axios");
const Message = require("../models/Message");

const openaiApiKey = process.env.OPENAI_API_KEY;

class Second_Assistant {
  constructor() {
    this.handleUserQuery = this.handleUserQuery.bind(this);
  }

  async getLastMessages(phoneNumber) {
    try {
      const messages = await Message.findAll({
        where: { phone_number: phoneNumber },
        order: [["created_at", "DESC"]],
        limit: 5,
      });

      if (messages.length === 0) return [];

      // Добавляем заголовок перед сообщениями
      return [
        {
          role: "system",
          content: "Пайдаланушының алдыңғы сообщениялары:",
        },
        ...messages.map((msg) => ({
          role: "user",
          content: msg.message,
        })),
      ];
    } catch (error) {
      console.error("Ошибка получения сообщений:", error.message);
      return [];
    }
  }

  async getAIResponse(phoneNumber, userMessage) {
    try {
      // Получаем последние 5 сообщений пользователя
      const previousMessages = await this.getLastMessages(phoneNumber);
      console.log({ "Чат пользователя": previousMessages });

      // Запрашиваем релевантные данные из Pinecone
      const response = await axios.post(
        `${process.env.host}/pinecone/first/ai`,
        { message: userMessage, phoneNumber: phoneNumber }
      );
      const databaseResults = response.data || [];
      console.log({ databaseResults });

      let prompt = userMessage;
      if (databaseResults.length > 0) {
        const combinedAnswers = databaseResults
          .map((res) => res.metadata.answer)
          .join("\n");
        prompt = `Пайдаланушының хабарламасы: "${userMessage}"\n\n База данныхтан табылған ақпарат:\n${combinedAnswers}`;
      }

      const systemMessage = {
        role: "system",
        content: `Сіз - Қазақстандағы заңгерлік қызметтерді сатуға арналған виртуалды көмекшіз.
        Сіздің негізгі мақсатыңыз – қызметтерді кәсіби түрде таныстыру, клиенттердің сұрақтарына жауап беру және оларға сәйкес келетін нұсқаны таңдауға көмектесу.
        
        🟢 Қарым-қатынас ережелері:
        1. Тіл:
        Егер пайдаланушы қазақша жазса, қазақша жауап беріңіз.
        Егер пайдаланушы орысша жазса, орысша жауап беріңіз.
        Егер тіл түсініксіз немесе аралас болса, сұрақты қай тілде түсіндіруді қалайтынын сұраңыз.
        2. Қарым-қатынас стилі:
        Әрқашан сыпайы, достық қарым-қатынаста және кәсіби болыңыз.
        Қиын заң терминдерінен аулақ болыңыз, түсінікті, қарапайым тілмен түсіндіріңіз.
        Жауаптарыңызды мүмкіндігінше қысқа, бірақ нақты беріңіз.
        3. Қалай жауап беру керек:
        ✅ Егер пайдаланушының сұранысы базаға сәйкес келсе:
        - Қызмет туралы толық ақпарат беріңіз.
        
        ❌ Егер база ақпаратты тапса, бірақ ол пайдаланушының сұранысына жауап болмайтын болса былай жауап бересін:
        - "Сіздің сұрағыңызды түсінбедім. Нақты нені білгіңіз келеді?"
        - Пайдаланушының сұрауын нақтылауды сұраңыз.
        
        🔄 Егер база сұранысқа сәйкес келмесе:
        - "Кешіріңіз, мен сұранысыңызды толық түсінбедім. Қандай қызмет туралы сұрап тұрғаныңызды нақтылай аласыз ба?"
        - Пайдаланушыға қайта тұжырымдауға немесе қосымша ақпарат беруге көмектесіңіз.
        
        📝 Жауап үлгілері:
        ✅ Егер пайдаланушының сұрағына жауап базадан табылса былай жауап бересін:
        "(Егер пайдаланушы хабарламаны амандасудан бастаса, жауапты амандасудан бастайсын. Егер хабарламаны амандасусыз бастаса, сұраққа амандасусыз жауап бересің. ),  Бұл қызметке мыналар кіреді: [қызмет сипаттамасы]. Сізге осы қызмет қажет пе?"
        
        ⚠️ Егер база ақпарат тапса, бірақ ол сұранысқа нақты жауап болмаса:
        "База бойынша табылған ақпарат: [ақпарат]. Бірақ бұл сіз іздеген ақпарат па? Нақтыласаңыз, мен сізге жақсырақ көмектесе аламын!"
        
        ❌ Егер қызмет табылмаса:
        "Кешіріңіз, мен сұранысыңызды толық түсінбедім. Сізге қандай заңгерлік көмек қажет екенін нақтылай аласыз ба?"
        
        🔍 Мақсатыңыз:
        Клиентке ең ыңғайлы түрде қажетті қызметті табуға көмектесу, оған сенімділік беру және қосымша сұрақтарына жауап беру.
        
        `, // Системное сообщение без изменений
      };

      const messages = [
        systemMessage,
        ...previousMessages,
        { role: "user", content: prompt },
      ];

      // Отправляем в OpenAI
      const aiResponse = await axios.post(
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

      const aiMessage =
        aiResponse.data.choices?.[0]?.message?.content?.trim() ||
        "Кешіріңіз, мен сұранысыңызды түсінбедім.";

      // ✅ Перед сохранением проверяем количество сообщений
      const userMessagesCount = await Message.count({
        where: { phone_number: phoneNumber },
      });

      if (userMessagesCount >= 10) {
        // Удаляем самое старое сообщение
        const oldestMessage = await Message.findOne({
          where: { phone_number: phoneNumber },
          order: [["created_at", "ASC"]], // Берем самое старое сообщение
        });

        if (oldestMessage) {
          await oldestMessage.destroy();
        }
      }

      // ✅ Сохраняем ТОЛЬКО запрос пользователя
      await Message.create({
        phone_number: phoneNumber,
        message: userMessage, // Сохраняем только userMessage
      });

      return aiMessage;
    } catch (error) {
      console.error("Ошибка AI:", error.message);
      return "Извините, возникла ошибка. Попробуйте позже.";
    }
  }

  async handleUserQuery(req, res) {
    try {
      const { phoneNumber, query } = req.body;
      if (!query || !phoneNumber)
        return res.status(400).json({ error: "Введите номер и сообщение" });

      console.log(`🔍 Запрос от ${phoneNumber}: "${query}"`);
      const response = await this.getAIResponse(phoneNumber, query);
      return res.status(200).json({ source: "Second_AI", answer: response });
    } catch (error) {
      console.error("❌ Ошибка обработки запроса:", error.message);
      return res.status(500).json({ message: "Ошибка обработки запроса" });
    }
  }
}

module.exports = new Second_Assistant();
