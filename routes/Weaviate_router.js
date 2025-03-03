const Router = require("express");
const Weaviate_controller = require("../Controllers/Weaviate_controller");
const Weaviate_router = new Router();

Weaviate_router.post("/search/info", Weaviate_controller.searchInformation);
Weaviate_router.post("/add-info", Weaviate_controller.addInformation);

module.exports = Weaviate_router;
