const Router = require("express");
const ai_controller = require("../Controllers/ai_controller");

const ai_router = new Router();

ai_router.post("/respond", ai_controller.respond);
ai_router.post("/analyze", ai_controller.analyze);
ai_router.post("/search", ai_controller.search);
ai_router.post("/chat", ai_controller.process);

module.exports = ai_router;
