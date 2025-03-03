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

      return messages.map((msg) => msg.message);
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
              content:
                "Ты удаляешь из сообщения приветствия и вежливые фразы, оставляя только суть.",
            },
            { role: "user", content: `Очисти это сообщение: "${message}"` },
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
      const response = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4-turbo",
          messages: [
            {
              role: "system",
              content: `Ты анализируешь, связано ли новое сообщение с предыдущими. 
                                  Если да — уточняешь контекст. 
                                  Если нет — оставляешь как есть.
                                  Не меняй смысл и не добавляй ненужных слов.`,
            },
            {
              role: "user",
              content: `История сообщений:\n${previousMessages.join(
                "\n"
              )}\n\nНовое сообщение: "${message}"\n\nСкорректируй его, если нужно, иначе оставь без изменений:`,
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

      const response = await axios.post(
        `${process.env.host}/pinecone/search`,
        {
          query: finalQuery,
        }
      );

      return res.status(200).json(response.data);
    } catch (error) {
      console.error("❌ Ошибка обработки запроса:", error.message);
      return res.status(500).json({ message: "Ошибка обработки запроса" });
    }
  }
}

module.exports = new First_Assistant();
