const { DataTypes } = require("sequelize");
const sequelize = require("../db");

const Message = sequelize.define("Message", {
    phone_number: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    ai_response: {
        type: DataTypes.TEXT, // AI-дың жауабын сақтау үшін жаңа баған
        allowNull: false,
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
    },
});

module.exports = Message;
