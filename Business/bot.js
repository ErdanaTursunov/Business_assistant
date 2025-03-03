require("dotenv").config();
const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const { OpenAI } = require("openai");
const http = require("http");
const fs = require("fs");
const path = require("path");

const client = new Client({
    authStrategy: new LocalAuth(),
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

const botStartTime = new Date();

function generateHtmlWithQrCode(qrCodeUrl) {
    const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>WhatsApp Bot</title>
        </head>
        <body>
            <h1>Welcome to WhatsApp Bot</h1>
            <p>To connect your WhatsApp account, scan the QR code below:</p>
            <div id="qr-container">
                <img src="${qrCodeUrl}" alt="QR Code" />
            </div>
        </body>
        </html>
    `;
    
    const filePath = path.join(__dirname, 'index.html');
    
    fs.writeFileSync(filePath, htmlContent, 'utf-8');
    console.log('index.html сгенерирован!');
}

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        const filePath = path.join(__dirname, 'index.html');

        if (fs.existsSync(filePath)) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            fs.createReadStream(filePath).pipe(res);
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end("Ошибка: файл index.html не найден!");
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end("Not Found");
    }
});

client.on("qr", (qr) => {
    qrcode.toDataURL(qr, (err, url) => {
        if (err) {
            console.error("Ошибка генерации QR-кода:", err);
            return;
        }
        
        generateHtmlWithQrCode(url);
    });
});

client.on("ready", () => {
    console.log("✅ Бот запущен и готов к работе!");
});

client.on("message", async (message) => {
    if (message.isGroupMsg) return;

    if (message.fromMe || message.author) return;

    if (message.timestamp * 1000 < botStartTime.getTime()) return;

    console.log(`📩 Новое сообщение от ${message.from}: ${message.body}`);

    const aiResponse = await getChatGPTResponse(message.body);

    await client.sendMessage(message.from, aiResponse);
});

async function getChatGPTResponse(prompt) {
    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: "Сен заңгер, экспертсің" },
                       { role: "user", content: prompt }],
            temperature: 0.7,
        });
        return response.choices[0].message.content;
    } catch (error) {
        console.error("Ошибка OpenAI:", error);
        return "Ошибка генерации ответа 😕";
    }
}

client.initialize();

server.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});
