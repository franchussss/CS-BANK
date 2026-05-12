const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bankController');

// ── Personas ──────────────────────────────────
// POST /persons           → registrar persona nueva (la llama tu frontend)
// GET  /persons/:cbu      → buscar persona por CBU (la llama el Banco Central o tu frontend)
router.post('/persons', bankController.registrarPersona);
router.get('/persons/:cbu', bankController.getPersonByCBU);

// ── Transferencias ────────────────────────────
// POST /transactions      → iniciar transferencia saliente
// GET  /transactions/:cbu → historial de movimientos de una cuenta
router.post('/transactions', bankController.realizarTransferencia);
router.get('/transactions/:cbu', bankController.getMovimientos);

module.exports = router;
