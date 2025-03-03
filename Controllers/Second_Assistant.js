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

  async shouldQueryDatabase(userMessage) {
    try {
      const aiDecision = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4-turbo",
          messages: [
            {
              role: "system",
              content: `Сенің міндетің — пайдаланушының хабарламасын талдап, дерекқорға (БД) жүгіну қажет пе, жоқ па екенін анықтау.  
              Егер БД-ға жүгіну **қажет болса**, "yes" деп жауап бер. Егер **қажет болмаса**, "no" деп жауап бер.  
              
              #### БД-ға жүгінудің ҚАЖЕТІ ЖОҚ (жауап "no"):  
              - "Сәлем!"  
              - "Қалайсың?"  
              - "Не істеп жатырсың?"  
              - "Сау бол!"  
              - "Сен не білесің?"  
              - "Сенің мүмкіндіктерің қандай?"  
              - "Сен кімсің?"  
              
              #### БД-ға жүгіну ҚАЖЕТ (жауап "yes"):  
              - "Кредит алу үшін қандай құжаттар керек?"  
              - "Сізде қандай қызметтер бар?"  
              - "Бағаларыңыз қандай?"  
              - "Мені ипотека қызықтырады."  
              - "Мен бүгін несие төлей аламын ба?"  
              - "Қалай тіркелуге болады?"  
              - "Сіздер қайда орналасқансыздар?"  
              
              Сен **тек "yes" немесе "no" деп жауап беруің керек**. Басқа ештеңе жазба.  
              `,
            },
            { role: "user", content: userMessage },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
            "Content-Type": "application/json",
          },
        }
      );

      const decision = aiDecision.data.choices?.[0]?.message?.content
        ?.trim()
        .toLowerCase();
      console.log("🔍 AI решение:", decision);

      // Гарантируем, что ответ только "yes" или "no"
      if (decision === "yes") return true;
      if (decision === "no") return false;

      console.warn("⚠️ Неожиданный ответ от AI:", decision);
      return false; // Если ответ неожиданного формата, берем false по умолчанию
    } catch (error) {
      console.error("❌ Ошибка определения:", error.message);
      return true; // Если произошла ошибка, безопаснее обратиться к БД
    }
  }

  async getAIResponse(phoneNumber, userMessage) {
    try {
      const previousMessages = await this.getLastMessages(phoneNumber);
      console.log({ "Чат пользователя": previousMessages });

      let databaseResults = [];
      const queryDatabase = await this.shouldQueryDatabase(userMessage);

      if (queryDatabase) {
        const response = await axios.post(
          `${process.env.host}/pinecone/first/ai`,
          { message: userMessage, phoneNumber }
        );
        databaseResults = response.data || [];
        console.log({ databaseResults });
      }

      let prompt = userMessage;
      if (databaseResults.length > 0) {
        const combinedAnswers = databaseResults
          .map((res) => res.metadata.answer)
          .join("\n");
        prompt = `Пайдаланушының соңғы хабарламасы: "${userMessage}"\n\n База данныхтан табылған ақпарат:\n${combinedAnswers}`;
      }

      // Проверяем, содержит ли userMessage приветствие
      const greetingWords = [
        "сәлем",
        "сәлеметсіз бе",
        "привет",
        "здравствуйте",
        "hi",
        "hello",
      ];
      const hasGreeting = greetingWords.some((word) =>
        userMessage.toLowerCase().startsWith(word)
      );

      let systemMessageContent = `
            Сіз - Қазақстандағы заңгерлік қызметтерді сатуға арналған виртуалды көмекшісіз.
            Сіздің негізгі мақсатыңыз – қызметтерді кәсіби түрде таныстыру, клиенттердің сұрақтарына жауап беру және оларға сәйкес келетін нұсқаны таңдауға көмектесу.
            
            🟢 Қарым-қатынас ережелері:
            - Әрқашан сыпайы, достық қарым-қатынаста және кәсіби болыңыз.
            - Қиын заң терминдерінен аулақ болыңыз, түсінікті, қарапайым тілмен түсіндіріңіз.
            - Жауаптарыңызды қысқа, бірақ нақты беріңіз.
        `;

      if (!hasGreeting) {
        systemMessageContent += `
                ❗Маңызды: Егер пайдаланушы хабарламаны амандасудан бастамаса, жауапты амандасусыз баста.
            `;
        // Меняем сам prompt для OpenAI
        prompt = `❗Пайдаланушы амандаспады, сондықтан жауапты амандасусыз баста.\n\n${prompt}`;
      }

      const systemMessage = { role: "system", content: systemMessageContent };

      const messages = [
        systemMessage,
        ...previousMessages,
        { role: "user", content: prompt },
      ];

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

      // Удаляем старые сообщения, если их больше 10
      const userMessagesCount = await Message.count({
        where: { phone_number: phoneNumber },
      });
      if (userMessagesCount >= 10) {
        const oldestMessage = await Message.findOne({
          where: { phone_number: phoneNumber },
          order: [["created_at", "ASC"]],
        });

        if (oldestMessage) {
          await oldestMessage.destroy();
        }
      }

      // Сохраняем только запрос пользователя
      await Message.create({
        phone_number: phoneNumber,
        message: userMessage,
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
