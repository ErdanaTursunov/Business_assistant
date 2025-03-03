require("dotenv").config();
const axios = require("axios");

const WEAVIATE_URL = "http://localhost:8080/v1";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

class Weaviate_controller {
  constructor() {
    this.getOpenAIEmbedding = this.getOpenAIEmbedding.bind(this);
    this.addInformation = this.addInformation.bind(this);
    this.searchInformation = this.searchInformation.bind(this);
  }

  // Получаем эмбеддинг для description и keywords
  async getOpenAIEmbedding(text) {
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/embeddings",
        {
          input: text,
          model: "text-embedding-3-small",
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      return response.data.data[0].embedding;
    } catch (error) {
      console.error(
        "Ошибка при получении эмбеддинга:",
        error.response?.data || error.message
      );
      throw new Error("Ошибка при создании вектора");
    }
  }

  // Добавление информации в Weaviate
  async addInformation(req, res) {
    const { description, keywords, title, author } = req.body;

    try {
      const embedding = await this.getOpenAIEmbedding(
        `${description} ${keywords}`
      );

      const data = {
        class: "Information", // Используем один класс "Information"
        properties: { description, keywords, title, author }, // Храним все данные в одном объекте
        vector: embedding, // Вектор только по description и keywords
      };

      const response = await axios.post(`${WEAVIATE_URL}/objects`, data);
      res.status(201).json({ message: "Информация добавлена", data: response.data });
    } catch (error) {
      res.status(500).json({
        error: "Ошибка при добавлении информации",
        details: error.response ? error.response.data : error.message,
      });
    }
  }

  // Поиск информации по смыслу (векторный поиск)
  async searchInformation(req, res) {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Введите поисковый запрос" });
    }

    try {
      const queryEmbedding = await this.getOpenAIEmbedding(query);

      const graphqlQuery = {
        query: `
        {
          Get {
            Information(
              nearVector: { vector: [${queryEmbedding.join(",")}] distance: 0.5 }
            ) {
              title
              description
              keywords
            }
          }
        }
        `,
      };

      const response = await axios.post(`${WEAVIATE_URL}/graphql`, graphqlQuery);

      if (!response.data?.data?.Get?.Information || response.data.data.Get.Information.length === 0) {
        return res.status(404).json({ message: "Информация не найдена" });
      }

      res.status(200).json({ message: "Результаты поиска", data: response.data.data.Get.Information });
    } catch (error) {
      res.status(500).json({
        error: "Ошибка при поиске информации",
        details: error.response ? error.response.data : error.message,
      });
    }
  }
}

module.exports = new Weaviate_controller();
