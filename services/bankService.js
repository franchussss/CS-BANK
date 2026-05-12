const axios = require('axios');
const supabase = require('../supabaseClient');

const CENTRAL_URL = process.env.CENTRAL_URL;
const CENTRAL_API_KEY = process.env.CENTRAL_API_KEY;

const headersBC = {
    'x-api-key': CENTRAL_API_KEY,
    'Content-Type': 'application/json',
    'x-environment': 'test'
};

// ─────────────────────────────────────────────
// REGISTRO DEL BANCO
// ─────────────────────────────────────────────
async function registrarBanco() {
    const registerToken = process.env.CENTRAL_REGISTER_TOKEN;

    if (!registerToken) {
        console.warn('⚠️  Falta CENTRAL_REGISTER_TOKEN — saltando registro');
        return;
    }

    try {
        const response = await axios.post(
            `${CENTRAL_URL}/banks`,
            { name: 'CSBANK' },
            {
                headers: {
                    'Authorization': `Bearer ${registerToken}`,
                    'Content-Type': 'application/json',
                    'x-environment': 'test'
                }
            }
        );
        console.log('✅ Banco registrado:', response.data);
    } catch (error) {
        if (error.response?.status === 409) {
            console.log('ℹ️  El banco ya estaba registrado — OK');
        } else {
            console.error('❌ Error registrando banco:', error.response?.data || error.message);
        }
    }
}

// ─────────────────────────────────────────────
// TRANSFERENCIA SALIENTE
// ─────────────────────────────────────────────
async function enviarTransferencia({ cbuOrigen, cbuDestino, importe, saldoOrigen }) {
    const response = await axios.post(
        `${CENTRAL_URL}/transactions`,
        { cbuOrigen, cbuDestino, importe, saldoOrigen },
        { headers: headersBC }
    );
    return response.data;
}

// ─────────────────────────────────────────────
// POLLING — RECIBIR TRANSFERENCIAS ENTRANTES
// El Banco Central NO nos llama. Nosotros le preguntamos cada 15 min.
// Cuando encontramos transferencias donde somos destino → acreditamos saldo.
//
// IDEMPOTENCIA: usamos la columna "concepto" de la tabla transferencias
// para guardar el ID del Banco Central (transaccion_id_bc).
// Así si la misma tx aparece en dos polls seguidos, no la procesamos dos veces.
// ─────────────────────────────────────────────
async function procesarTransferenciasRecibidas() {
    console.log('🔄 Polling: consultando transferencias entrantes...');

    let txsBC;
    try {
        const response = await axios.get(
            `${CENTRAL_URL}/transactions?minutos=30`,
            { headers: headersBC }
        );
        txsBC = response.data;
    } catch (error) {
        console.error('❌ Error consultando Banco Central:', error.response?.data || error.message);
        return;
    }

    // Filtramos solo las aprobadas
    const aprobadas = txsBC.filter(tx => tx.estado === 'aprobada');

    if (aprobadas.length === 0) {
        console.log('   Sin transferencias aprobadas en los últimos 30 min.');
        return;
    }

    for (const tx of aprobadas) {
        await procesarUnaTransferencia(tx);
    }
}

async function procesarUnaTransferencia(tx) {
    // 1. Verificar que el CBU destino existe en NUESTRO banco (tabla cuentas)
    const { data: cuentaDestino, error: errCuenta } = await supabase
        .from('cuentas')
        .select('id_cuenta, saldo, estado')
        .eq('cbu', tx.cbuDestino)
        .single();

    // Si no está en nuestras cuentas, esta transferencia no es para nosotros
    if (errCuenta || !cuentaDestino) return;

    // 2. Verificar idempotencia: ¿ya procesamos esta transferencia?
    // Guardamos el ID del BC en el campo "concepto" con un prefijo especial
    const idBCMarcado = `BC_TX:${tx._id}`;
    const { data: yaExiste } = await supabase
        .from('transferencias')
        .select('id_tranferencias')
        .eq('concepto', idBCMarcado)
        .single();

    if (yaExiste) {
        // Ya la procesamos → saltar
        return;
    }

    // 3. Acreditar el saldo en la cuenta destino
    const nuevoSaldo = Number(cuentaDestino.saldo) + Number(tx.importe);

    const { error: errSaldo } = await supabase
        .from('cuentas')
        .update({ saldo: nuevoSaldo })
        .eq('id_cuenta', cuentaDestino.id_cuenta);

    if (errSaldo) {
        console.error(`❌ Error acreditando saldo para ${tx.cbuDestino}:`, errSaldo.message);
        return;
    }

    // 4. Guardar en "transferencias" como recibida
    // Usamos cuenta_destino para el CBU destino (somos nosotros)
    // y concepto para guardar el ID del BC (para idempotencia)
    await supabase.from('transferencias').insert({
        id_cuenta_origen: null,        // no tenemos el id_cuenta del banco externo
        cuenta_destino: tx.cbuDestino,
        monto: tx.importe,
        concepto: idBCMarcado,         // guardamos el ID del BC acá para no repetir
        estado: 'aprobada',
        fecha_hora: tx.createdAt || new Date()
    });

    // 5. Guardar en "movimientos" como crédito
    await supabase.from('movimientos').insert({
        id_cuenta: cuentaDestino.id_cuenta,
        tipo_movimiento: 'credito',
        monto: tx.importe,
        fecha_hora: tx.createdAt || new Date()
    });

    const nombreOrigen = tx.personaOrigen
        ? `${tx.personaOrigen.nombre} ${tx.personaOrigen.apellido}`
        : 'banco externo';

    console.log(`✅ Acreditado: $${tx.importe} de ${nombreOrigen} → ${tx.cbuDestino}`);
}

module.exports = {
    registrarBanco,
    enviarTransferencia,
    procesarTransferenciasRecibidas
};
