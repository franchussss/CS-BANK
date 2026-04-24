const axios = require('axios');

const PROFE_API_KEY = process.env.PROFE_API_KEY || 'TU_KEY_DEL_LUNES_AQUÍ';

const CENTRAL_URL = 'http://la-url-del-profe.com'; 

const realizarTransferencia = async (datosTransferencia) => {
    try {
        const response = await axios.post(`${CENTRAL_URL}/transferir`, datosTransferencia, {
            headers: {
                'Authorization': `Bearer ${PROFE_API_KEY}`
            }
        });

        return response.data;
        
    } catch (error) {
        console.error('Error al conectar con la Central del profe:', error);
        throw error;
    }
};

module.exports = {
    realizarTransferencia
};