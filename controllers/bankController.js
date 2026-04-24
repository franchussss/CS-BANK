const bankModel = require('../models/bankModel');

const getStatus = (req, res) => {
    // Traemos los usuarios del modelo
    const listaUsuarios = bankModel.obtenerTodos();
    
    res.json({ 
        mensaje: 'CS BANK API ONLINE',
        usuariosRegistrados: listaUsuarios 
    });
};

module.exports = { getStatus };
const recibirTransferencia = (req, res) => {
    const datos = req.body;
    console.log('Recibimos una transferencia:', datos);
    res.status(200).json({ mensaje: 'Transferencia recibida en CS BANK' });
};

module.exports = { 
    getStatus, 
    recibirTransferencia 
};