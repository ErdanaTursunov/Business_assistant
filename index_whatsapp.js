require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const qrcode = require("qrcode");
const qrcodeTerminal = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");

const Pinecone_router = require("./routes/Pinecone_router");
const Weaviate_router = require("./routes/Weaviate_router");
const sequelize = require("./db");
const Message = require("./models/Message");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(bodyParser.json());

app.use("/weaviate", Weaviate_router);
app.use("/pinecone", Pinecone_router);

const client = new Client({
  authStrategy: new LocalAuth(),
});

let lastQrCode = null; // Переменная для хранения QR-кода

client.on("qr", (qr) => {
  lastQrCode = qr; // Сохраняем последний QR-код
  console.log("📱 Отсканируйте QR-код для входа в WhatsApp:");
  qrcodeTerminal.generate(qr, { small: true }); // Вывод QR-кода в консоли
});

client.on("ready", () => {
  console.log("✅ WhatsApp-бот запущен и готов к работе!");
});

client.on("message", async (message) => {
  if (message.isGroupMsg || message.fromMe || message.author) return;

  console.log(`📩 Новое сообщение от ${message.from}: ${message.body}`);

  try {
    // Сохранение сообщения пользователя в базу данных
    await Message.create({
      phone_number: message.from,
      message: message.body,
    });

    // Удаление старых сообщений (храним только 5 последних)
    const userMessages = await Message.findAll({
      where: { phone_number: message.from },
      order: [["created_at", "DESC"]],
    });

    if (userMessages.length > 5) {
      const messagesToDelete = userMessages.slice(5); // Оставляем только последние 5
      await Promise.all(messagesToDelete.map((msg) => msg.destroy()));
    }

    // Отправка запроса к AI
    const response = await axios.post(`${process.env.host}/pinecone/second/ai`, {
      query: message.body,
      phoneNumber: message.from
    });

    const aiResponse = response.data?.answer || "Ошибка в AI-ответе";
    await client.sendMessage(message.from, aiResponse);
  } catch (error) {
    console.error("❌ Ошибка:", error.message);
    await client.sendMessage(
      message.from,
      "⚠️ Ошибка обработки запроса. Попробуйте позже."
    );
  }
});

client.initialize();

// Маршрут для отображения QR-кода в браузере
app.get("/qr", async (req, res) => {
  if (!lastQrCode) return res.status(404).send("QR-код ещё не сгенерирован");

  const qrImage = await qrcode.toDataURL(lastQrCode);
  res.send(`<img src="${qrImage}" alt="QR Code" />`);
});

const start = async () => {
  try {
    sequelize
      .sync({ alter: "true" })
      .then(() => console.log("Успешное синхронизация к PostgreSQL! 🚀"))
      .catch((err) => console.error("Ошибка подключения:", err));

    sequelize
      .authenticate()
      .then(() => console.log("Успешное подключение к PostgreSQL! 🚀"))
      .catch((err) => console.error("Ошибка подключения:", err));

    app.listen(PORT, () => {
      console.log(`🚀 Сервер работает на порту ${PORT}`);
    });
  } catch (e) {
    console.log("❌ Ошибка запуска сервера:", e);
  }
};

start();
