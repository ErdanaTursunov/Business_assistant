require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const qrcode = require("qrcode");
const fs = require("fs");
const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");

const Pinecone_router = require("./routes/Pinecone_router");
const Weaviate_router = require("./routes/Weaviate_router");
const sequelize = require("./db");
const ai_router = require("./routes/Ai_router");

const PORT = process.env.PORT || 4000;
const app = express();

app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Подключаем маршруты
app.use("/weaviate", Weaviate_router);
app.use("/pinecone", Pinecone_router);
app.use("/ai", ai_router);

// Удаляем старую сессию при старте сервера
const sessionPath = path.join(__dirname, "session");
if (fs.existsSync(sessionPath)) {
  fs.rmSync(sessionPath, { recursive: true, force: true });
  console.log("🗑️ Удалена старая сессия WhatsApp");
}

// Создаём клиента WhatsApp
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: sessionPath }),
  puppeteer: {
    executablePath:
      process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/google-chrome-stable",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

let lastQrCode = null;

client.on("qr", async (qr) => {
  lastQrCode = qr;
  console.log("📱 Отсканируйте QR-код для входа в WhatsApp");
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
    const response = await axios.post(`${process.env.host}/ai/chat`, {
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

client.initialize();

// Получение QR-кода в виде изображения
app.get("/qr-image", async (req, res) => {
  if (!lastQrCode) {
    return res.status(404).send("QR-код ещё не сгенерирован");
  }
  try {
    const qrImage = await qrcode.toDataURL(lastQrCode);
    res.send(qrImage);
  } catch (error) {
    console.error("Ошибка генерации QR-кода:", error.message);
    res.status(500).send("Ошибка генерации QR-кода");
  }
});

// Проверка статуса авторизации в WhatsApp
app.get("/status", async (req, res) => {
  const isAuthenticated = client.info?.wid ? true : false;
  console.log("Состояние клиента:", client.info);
  res.json({ authenticated: isAuthenticated });
});

// Выход из WhatsApp и очистка сессии
app.post("/logout", async (req, res) => {
  try {
    if (client) {
      await client.logout();
      await client.destroy();
      console.log("🔴 WhatsApp-сессия уничтожена!");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log("🗑️ Удалена папка сессии WhatsApp");
    }

    console.log("🔄 Перезапуск сервера...");
    res.sendStatus(200);

    // Завершаем процесс, чтобы сервер перезапустился (PM2 или nodemon поднимут его снова)
    process.exit(0);
  } catch (error) {
    console.error("❌ Ошибка при выходе:", error.message);
    res.status(500).json({ error: "Ошибка выхода" });
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
