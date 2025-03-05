require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const Pinecone_router = require("./routes/Pinecone_router");
const Weaviate_router = require("./routes/Weaviate_router");
const sequelize = require("./db");
const ai_router = require("./routes/Ai_router");

const PORT = process.env.PORT || 4000;
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(bodyParser.json());

app.use("/weaviate", Weaviate_router);
app.use("/pinecone", Pinecone_router);
app.use("/ai", ai_router);

const start = async () => {
  try {

    // await sequelize.sync({ alter: true });
    // console.log("✅ База данных синхронизирована!");

    // Проверяем подключение
    sequelize
      .authenticate()
      .then(() => console.log("Успешное подключение к PostgreSQL! 🚀"))
      .catch((err) => console.error("Ошибка подключения:", err));

    app.listen(PORT, () => {
      console.log(`Сервер работает на порту ${PORT}`);
    });
  } catch (e) {
    console.log("Error starting server:", e);
  }
};

start();
