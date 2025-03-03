const Router = require("express");
const Pinecone_router = new Router();
const PineconeLarge = require("../Controllers/pinecone_large");
const aiAssistant = require("../Controllers/aiAssistant");
const First_Assistant = require("../Controllers/First_Assistant");
const Second_Assistant = require("../Controllers/Second_Assistant");

Pinecone_router.post("/ai", aiAssistant.handleUserQuery);
Pinecone_router.post("/search", PineconeLarge.searchPinecone);
Pinecone_router.post("/add", PineconeLarge.addToPinecone);



Pinecone_router.post("/first/ai", First_Assistant.handleUserQuery)
Pinecone_router.post("/second/ai", Second_Assistant.handleUserQuery)

module.exports = Pinecone_router;
