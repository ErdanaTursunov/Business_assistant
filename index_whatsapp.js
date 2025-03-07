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
const ai_router = require("./routes/Ai_router");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(bodyParser.json());

// Раздача статических файлов
app.use(express.static(path.join(__dirname, "public")));

// Маршруты
app.use("/weaviate", Weaviate_router);
app.use("/pinecone", Pinecone_router);
app.use("/ai", ai_router);

// Инициализация WhatsApp клиента
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: '/usr/bin/google-chrome', // путь к установленному браузеру
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

let lastQrCode = null;

client.on("qr", async (qr) => {
  lastQrCode = qr;
  console.log("\n📱 Отсканируйте QR-код для входа в WhatsApp\n");

  qrcode.toString(qr, { type: "terminal" }, (err, url) => {
    if (err) return console.error("❌ Ошибка генерации QR-кода:", err);
    console.log(url);
  });
});

client.on("ready", () => {
  console.log("✅ WhatsApp-бот подключён и готов к работе!");
});

client.on("message", async (message) => {
  if (message.isGroupMsg || message.fromMe || message.author) return;

  console.log(
    `📩 [${new Date().toLocaleTimeString()}] Сообщение от ${message.from}: ${message.body}`
  );

  try {
    const userMessages = await Message.findAll({
      where: { phone_number: message.from },
      order: [["createdAt", "DESC"]],
    });

    if (userMessages.length > 5) {
      await Promise.all(userMessages.slice(5).map((msg) => msg.destroy()));
    }

    // Важно: убедись, что process.env.host настроена на публичный URL твоего сервиса в Railway.
    const response = await axios.post(`${process.env.host}/ai/chat`, {
      question: message.body,
      phoneNumber: message.from,
    });

    const aiResponse =
      response.data?.response || "⚠️ Ошибка обработки запроса AI.";
    await client.sendMessage(message.from, aiResponse);
  } catch (error) {
    console.error(`❌ Ошибка обработки сообщения: ${error.message}`);
    await client.sendMessage(
      message.from,
      "⚠️ Ошибка сервера. Попробуйте позже."
    );
  }
});

client.initialize();

app.get("/qr-image", async (req, res) => {
  if (!lastQrCode) return res.status(404).send("QR-код ещё не сгенерирован");
  try {
    const qrImage = await qrcode.toDataURL(lastQrCode);
    const imgBuffer = Buffer.from(qrImage.split(",")[1], "base64");
    res.writeHead(200, { "Content-Type": "image/png" });
    res.end(imgBuffer);
  } catch (error) {
    console.error("❌ Ошибка генерации QR-кода:", error);
    res.status(500).send("Ошибка генерации QR-кода");
  }
});

const start = async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ База данных подключена!");

    // Здесь изменяем запуск сервера:
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Сервер запущен и доступен на порту ${PORT}`);
    });
  } catch (error) {
    console.error("❌ Ошибка при запуске сервера:", error.message);
  }
};

start();
