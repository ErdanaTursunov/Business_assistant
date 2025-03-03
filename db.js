const { Sequelize } = require("sequelize");

// Конфигурация подключения
const sequelize = new Sequelize(
  process.env.PGDATABASE,
  process.env.PGUSER,
  process.env.PGPASSWORD,
  {
    host: process.env.PGHOST,
    dialect: "postgres",
    port: 5432,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Для Neon обязательно
      },
    },
  }
);

module.exports = sequelize;
