const { Pinecone } = require("@pinecone-database/pinecone");
const { OpenAI } = require("openai");
const dotenv = require("dotenv");
const crypto = require("crypto");

dotenv.config();

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const index = pinecone.index(process.env.PINECONE_INDEX_NAME);

class PineconeLarge {
  constructor() {
    this.addToPinecone = this.addToPinecone.bind(this);
    this.searchPinecone = this.searchPinecone.bind(this);
  }

  async embedText(text) {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: Array.isArray(text) ? text : [text], // Поддержка массива
    });

    if (!response.data || !response.data.length) {
      throw new Error("Ошибка при получении эмбеддинга");
    }

    return response.data.map((item) => item.embedding);
  }

  async searchPinecone(req, res) {
    try {
      const { query, topK = 1 } = req.body;

      if (!query) {
        return res.status(400).json({ error: "Отсутствует запрос" });
      }

      const queryVector = await this.embedText(query);
      const results = await index.query({
        vector: queryVector[0],
        topK,
        includeMetadata: true,
      });

      if (!results.matches.length) {
        return res.json([]); // Если ничего не найдено, возвращаем пустой массив
      }

      // Определяем наивысший score
      const maxScore = results.matches[0].score;

      // Фильтруем: оставляем только те, у которых score >= 90% от maxScore
      const filteredResults = results.matches.filter(
        (match) => match.score >= maxScore * 0.9
      );

      res.json(filteredResults);
    } catch (error) {
      console.error("Ошибка при поиске в Pinecone:", error);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  }

  async addToPinecone(req, res) {
    try {
      let { data } = req.body; // Ожидаем массив объектов [{ text, answer }]

      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: "Отсутствует текст" });
      }

      const records = await Promise.all(
        data.map(async (item) => {
          if (!item.text) {
            throw new Error("Отсутствует текст у одного из объектов");
          }

          const vector = await this.embedText(item.text);
          const id = crypto
            .createHash("md5")
            .update(item.text)
            .digest("hex")
            .slice(0, 8); // Короткий ID

          return {
            id,
            values: vector,
            metadata: {
              text: item.text, // Храним оригинальный вопрос
              answer: item.answer || "", // Храним ответ, если есть
            },
          };
        })
      );

      await index.upsert(records);
      res.json({ message: "Данные добавлены" });
    } catch (error) {
      console.error("Ошибка при добавлении в Pinecone:", error);
      res.status(500).json({ error: "Ошибка сервера" });
    }
  }
}

module.exports = new PineconeLarge();
