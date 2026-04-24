const express = require('express');
const router = express.Router();
const bankController = require('../controllers/bankController');

router.get('/status', bankController.getStatus);

router.post('/transferencia', bankController.recibirTransferencia);

module.exports = router;