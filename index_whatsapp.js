require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const qrcode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");

// Импорт роутеров и базы данных
const Pinecone_router = require("./routes/Pinecone_router");
const Weaviate_router = require("./routes/Weaviate_router");
const sequelize = require("./db");
const Message = require("./models/Message");
const ai_router = require("./routes/Ai_router");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use("/weaviate", Weaviate_router);
app.use("/pinecone", Pinecone_router);
app.use("/ai", ai_router);

// Инициализация клиента WhatsApp с LocalAuth
const client = new Client({
  authStrategy: new LocalAuth(),
});

let lastQrCode = null;

// При получении QR-кода сохраняем его и выводим в консоль
client.on("qr", async (qr) => {
  lastQrCode = qr;
  console.log("📱 Отсканируйте QR-код для входа в WhatsApp");
  qrcode.toString(qr, { type: "terminal" }, (err, url) => {
    if (err) console.error("Ошибка генерации QR-кода:", err);
    console.log(url);
  });
});

// Когда клиент готов, выводим сообщение
client.on("ready", () => {
  console.log("✅ WhatsApp-бот запущен и готов к работе!");
});

// Обработка входящих сообщений
client.on("message", async (message) => {
  // Игнорируем сообщения из групп и сообщения, отправленные самим собой
  if (message.isGroupMsg || message.fromMe || message.author) return;
  console.log(`📩 Новое сообщение от ${message.from}: ${message.body}`);

  try {
    // Отправляем запрос к AI-сервису (убедиcь, что переменная окружения HOST задана)
    const response = await axios.post(`${process.env.HOST}/ai/chat`, {
      question: message.body,
      phoneNumber: message.from,
    });
    const aiResponse = response.data?.response || "⚠️ Ошибка в AI-ответе";
    await client.sendMessage(message.from, aiResponse);
  } catch (error) {
    console.error("❌ Ошибка обработки сообщения:", error.message);
    await client.sendMessage(
      message.from,
      "⚠️ Ошибка сервера. Попробуйте позже."
    );
  }
});

// Инициализация клиента
client.initialize();

// Маршрут для получения QR-кода в виде изображения
app.get("/qr-image", async (req, res) => {
  if (!lastQrCode) {
    return res.status(404).send("QR-код ещё не сгенерирован");
  }
  try {
    const qrImage = await qrcode.toDataURL(lastQrCode);
    res.send(`<img src="${qrImage}" alt="QR Code for WhatsApp login" />`);
  } catch (error) {
    console.error("Ошибка генерации QR-кода:", error.message);
    res.status(500).send("Ошибка генерации QR-кода");
  }
});

// Запуск сервера
const start = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Подключение к базе данных установлено!");

    app.listen(PORT, () => {
      console.log(`🚀 Сервер работает на порту ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Ошибка запуска сервера:", error.message);
  }
};

start();
