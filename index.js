const express = require('express');
require('dotenv').config();

const bankService = require('./services/bankService');
const bankRoutes = require('./routes/bankRoutes');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Health check
app.get('/', (req, res) => {
    res.json({ mensaje: 'CSBANK funcionando correctamente', status: 'ok' });
});

app.use('/', bankRoutes);

app.listen(PORT, async () => {
    console.log(`🚀 Servidor CSBANK corriendo en puerto ${PORT}`);

    // Registrar el banco en el Banco Central al arrancar
    // Si ya está registrado, el BC devuelve 409 y lo manejamos graciosamente
    try {
        await bankService.registrarBanco();
    } catch (error) {
        console.error('Error al registrar banco:', error.message);
    }

    // Polling: consultar transferencias recibidas cada 15 minutos
    // Usamos minutos=30 para tener overlap y no perder transferencias entre polls
    // (recomendación explícita del Banco Central en su documentación)
    const POLLING_INTERVAL_MS = 15 * 60 * 1000; // 15 minutos

    // Primera ejecución inmediata para no esperar 15 min al arrancar
    await bankService.procesarTransferenciasRecibidas();

    setInterval(async () => {
        await bankService.procesarTransferenciasRecibidas();
    }, POLLING_INTERVAL_MS);

    console.log('🔄 Polling de transferencias activo (cada 15 min)');
});
