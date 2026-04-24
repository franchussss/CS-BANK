const express = require('express');
require('dotenv').config();
const bankRoutes = require('./routes/bankRoutes');
const bankService = require('./services/bankService');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.use('/', bankRoutes);

app.listen(PORT, async () => {
    console.log('Servidor de CS BANK corriendo en puerto ' + PORT);
    
    console.log('Intentando registrar en Banco Central...');
    await bankService.registrarBanco();
});