require("dotenv").config();
const axios = require("axios");
const Message = require("../models/Message");

const openaiApiKey = process.env.OPENAI_API_KEY;

class First_Assistant {
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

      return [
        {
          role: "system",
          content: "Пайдаланушының алдыңғы сообщениялары:",
        },
        ...messages.flatMap((msg) => [
          { role: "user", content: msg.message },
          ...(msg.ai_response
            ? [{ role: "assistant", content: msg.ai_response }]
            : []),
        ]),
      ];
    } catch (error) {
      console.error("Ошибка получения сообщений:", error.message);
      return [];
    }
  }

  async cleanMessage(message) {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4-turbo",
          messages: [
            {
              role: "system",
              content: `Ты удаляешь только вежливые фразы (приветствия, благодарности). 
                        Не меняй смысл сообщения, не добавляй объяснения и не перефразируй текст.`,
            },
            {
              role: "user",
              content: `Очисти это сообщение, удалив только вежливые фразы: "${message}"`,
            },
          ],
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
      console.error("Ошибка очистки сообщения:", error.message);
      return message;
    }
  }

  async addContextIfNeeded(message, previousMessages) {
    try {
      // Формируем текстовую версию истории сообщений
      const historyText = previousMessages
        .map(
          (msg) =>
            `${msg.role === "user" ? "Пользователь" : "AI"}: ${msg.content}`
        )
        .join("\n");

      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4-turbo",
          messages: [
            {
              role: "system",
              content: `Ты исправляешь новое сообщение, чтобы оно стало конкретным и понятным, 
                        но не добавляешь свои размышления и объяснения.`,
            },
            {
              role: "user",
              content: `История сообщений:\n${historyText}\n\nНовое сообщение: "${message}"\n\nПерефразируй его так, чтобы оно было чётким и полным, но без дополнительных объяснений:`,
            },
          ],
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
      console.error("Ошибка добавления контекста:", error.message);
      return message;
    }
  }

  async handleUserQuery(req, res) {
    try {
      const { phoneNumber, message } = req.body;

      if (!phoneNumber || !message) {
        return res.status(400).json({ error: "Введите номер и сообщение" });
      }

      console.log(`🔍 Запрос от ${phoneNumber}: "${message}"`);

      const cleanedMessage = await this.cleanMessage(message);
      console.log("🧹 Очищенное сообщение:", cleanedMessage);

      const previousMessages = await this.getLastMessages(phoneNumber);
      const finalQuery = await this.addContextIfNeeded(
        cleanedMessage,
        previousMessages
      );
      console.log("📌 Итоговый запрос в векторную базу:", finalQuery);

      const response = await axios.post(`${process.env.host}/pinecone/search`, {
        query: finalQuery,
      });

      return res.status(200).json(response.data);
    } catch (error) {
      console.error("❌ Ошибка обработки запроса:", error.message);
      return res.status(500).json({ message: "Ошибка обработки запроса" });
    }
  }
}

module.exports = new First_Assistant();
