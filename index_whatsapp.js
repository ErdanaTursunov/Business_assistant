require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const qrcode = require("qrcode");
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

// Раздача статических файлов (index.html для QR-кода)
app.use(express.static(path.join(__dirname, "public")));

app.use("/weaviate", Weaviate_router);
app.use("/pinecone", Pinecone_router);

const client = new Client({
  authStrategy: new LocalAuth(),
});

let lastQrCode = null; // Хранение последнего QR-кода

client.on("qr", async (qr) => {
  lastQrCode = qr; // Сохранение QR-кода
  console.log("📱 Отсканируйте QR-код для входа в WhatsApp");

  // Генерация QR-кода в консоли
  qrcode.toString(qr, { type: "terminal" }, (err, url) => {
    if (err) console.error("Ошибка генерации QR-кода:", err);
    console.log(url);
  });
});

client.on("ready", () => {
  console.log("✅ WhatsApp-бот запущен и готов к работе!");
});

client.on("message", async (message) => {
  if (message.isGroupMsg || message.fromMe || message.author) return;

  console.log(`📩 Новое сообщение от ${message.from}: ${message.body}`);

  try {
    // Сохранение сообщения в базе данных
    await Message.create({
      phone_number: message.from,
      message: message.body,
    });

    // Удаление старых сообщений (храним только 5 последних)
    const userMessages = await Message.findAll({
      where: { phone_number: message.from },
      order: [["createdAt", "DESC"]],
    });

    if (userMessages.length > 5) {
      const messagesToDelete = userMessages.slice(5);
      await Promise.all(messagesToDelete.map((msg) => msg.destroy()));
    }

    // Запрос к AI
    const response = await axios.post(`${process.env.host}/pinecone/second/ai`, {
      query: message.body,
      phoneNumber: message.from,
    });

    const aiResponse = response.data?.answer || "⚠️ Ошибка в AI-ответе";
    await client.sendMessage(message.from, aiResponse);
  } catch (error) {
    console.error("❌ Ошибка обработки сообщения:", error);
    await client.sendMessage(message.from, "⚠️ Ошибка сервера. Попробуйте позже.");
  }
});

client.initialize();

// 📌 Маршрут для получения QR-кода в виде изображения
app.get("/qr-image", async (req, res) => {
  if (!lastQrCode) {
    return res.status(404).send("QR-код ещё не сгенерирован");
  }

  try {
    const qrImage = await qrcode.toDataURL(lastQrCode);
    const imgBuffer = Buffer.from(qrImage.split(",")[1], "base64");
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(imgBuffer);
  } catch (error) {
    console.error("Ошибка генерации QR-кода:", error);
    res.status(500).send("Ошибка генерации QR-кода");
  }
});

const start = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log("✅ База данных синхронизирована!");

    await sequelize.authenticate();
    console.log("✅ Подключение к базе данных установлено!");

    app.listen(PORT, () => {
      console.log(`🚀 Сервер работает на порту ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Ошибка запуска сервера:", error);
  }
};

start();
