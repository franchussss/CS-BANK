const supabase = require('../supabaseClient');
const bankService = require('../services/bankService');
const axios = require('axios');

// ─────────────────────────────────────────────
// GET /persons/:cbu
// ─────────────────────────────────────────────
const getPersonByCBU = async (req, res) => {
    const { cbu } = req.params;

    const { data, error } = await supabase
        .from('cuentas')
        .select(`
            id_cuenta,
            cbu,
            alias,
            saldo,
            estado,
            clientes (
                id_cliente,
                nombre,
                apellido,
                dni,
                email
            )
        `)
        .eq('cbu', cbu)
        .single();

    if (error) {
        if (error.code === 'PGRST116') {
            return res.status(404).json({ mensaje: 'CBU no encontrado' });
        }
        console.error('Error Supabase getPersonByCBU:', error);
        return res.status(500).json({ mensaje: 'Error de base de datos', detalle: error.message });
    }

    res.json({
        cbu: data.cbu,
        alias: data.alias,
        saldo: data.saldo,
        estado: data.estado,
        nombre: data.clientes?.nombre,
        apellido: data.clientes?.apellido,
        dni: data.clientes?.dni
    });
};

// ─────────────────────────────────────────────
// POST /persons
// CORRECCIÓN: el BC ahora devuelve 200 si la persona ya existía
// (además de 201 si es nueva). Ambos son éxito y traen el CBU.
// ─────────────────────────────────────────────
const registrarPersona = async (req, res) => {
    const { nombre, apellido, dni, email, telefono, contrasena } = req.body;

    if (!nombre || !apellido || !dni) {
        return res.status(400).json({ mensaje: 'Faltan campos obligatorios: nombre, apellido, dni' });
    }

    // 1. Registrar en el Banco Central
    let cbuAsignado;
    let yaExistiaEnBC = false;

    try {
        const responseBC = await axios.post(
            `${process.env.CENTRAL_URL}/persons`,
            { nombre, apellido, dni },
            {
                headers: {
                    'x-api-key': process.env.CENTRAL_API_KEY,
                    'Content-Type': 'application/json',
                    'x-environment': 'test'
                }
            }
        );
        // 201 = persona nueva creada en el BC
        cbuAsignado = responseBC.data.cbu;

    } catch (errorBC) {
        const status = errorBC.response?.status;
        const dataBC = errorBC.response?.data;

        if (status === 200) {
            // NUEVO: el BC devuelve 200 cuando la persona ya existía
            // Nos da el CBU que ya tenía → lo usamos para sincronizar
            cbuAsignado = dataBC.cbu;
            yaExistiaEnBC = true;

        } else if (status === 409) {
            // 409 = el DNI ya está en NUESTRO banco (no en el BC)
            return res.status(409).json({ mensaje: 'El DNI ya está registrado en CSBANK' });

        } else {
            console.error('Error BC registrarPersona:', dataBC || errorBC.message);
            return res.status(500).json({ mensaje: 'Error al registrar en el Banco Central' });
        }
    }

    // 2. Si la persona ya existía en el BC, verificar si ya la tenemos nosotros
    if (yaExistiaEnBC) {
        const { data: cuentaExistente } = await supabase
            .from('cuentas')
            .select('cbu')
            .eq('cbu', cbuAsignado)
            .single();

        if (cuentaExistente) {
            // Ya la tenemos → devolvemos sus datos (sincronización)
            return res.status(200).json({
                mensaje: 'La persona ya estaba registrada en CSBANK',
                cbu: cuentaExistente.cbu
            });
        }
        // Si no la tenemos en nuestra BD pero sí en el BC → la creamos igual
    }

    // 3. Guardar en "clientes"
    const { data: clienteCreado, error: errCliente } = await supabase
        .from('clientes')
        .insert({ nombre, apellido, dni, email: email || null, telefono: telefono || null, contrasena: contrasena || null })
        .select()
        .single();

    if (errCliente) {
        console.error('Error creando cliente:', errCliente);
        return res.status(500).json({ mensaje: 'Error al guardar el cliente' });
    }

    // 4. Guardar en "cuentas" con el CBU del Banco Central
    const { data: cuentaCreada, error: errCuenta } = await supabase
        .from('cuentas')
        .insert({
            id_cliente: clienteCreado.id_cliente,
            cbu: cbuAsignado,
            saldo: 0,
            estado: 'activa',
            id_moneda: 1
        })
        .select()
        .single();

    if (errCuenta) {
        console.error('Error creando cuenta:', errCuenta);
        return res.status(500).json({ mensaje: 'Error al crear la cuenta bancaria' });
    }

    res.status(201).json({
        mensaje: 'Cliente y cuenta creados correctamente',
        cbu: cuentaCreada.cbu,
        nombre: clienteCreado.nombre,
        apellido: clienteCreado.apellido,
        dni: clienteCreado.dni,
        saldo: cuentaCreada.saldo
    });
};

// ─────────────────────────────────────────────
// POST /transactions
// ─────────────────────────────────────────────
const realizarTransferencia = async (req, res) => {
    const { cbuOrigen, cbuDestino, importe, concepto } = req.body;

    if (!cbuOrigen || !cbuDestino || !importe) {
        return res.status(400).json({ mensaje: 'Faltan campos: cbuOrigen, cbuDestino, importe' });
    }
    if (Number(importe) <= 0) {
        return res.status(400).json({ mensaje: 'El importe debe ser mayor a cero' });
    }
    if (cbuOrigen === cbuDestino) {
        return res.status(400).json({ mensaje: 'El CBU origen y destino no pueden ser iguales' });
    }

    // 1. Buscar cuenta origen
    const { data: cuentaOrigen, error: errOrigen } = await supabase
        .from('cuentas')
        .select('id_cuenta, cbu, saldo, estado')
        .eq('cbu', cbuOrigen)
        .single();

    if (errOrigen || !cuentaOrigen) {
        return res.status(404).json({ mensaje: 'CBU origen no encontrado en CSBANK' });
    }
    if (cuentaOrigen.estado !== 'activa') {
        return res.status(403).json({ mensaje: 'La cuenta origen no está activa' });
    }

    // 2. Verificar saldo
    if (Number(cuentaOrigen.saldo) < Number(importe)) {
        return res.status(422).json({
            mensaje: 'Saldo insuficiente',
            saldo_actual: cuentaOrigen.saldo,
            importe_solicitado: importe
        });
    }

    // 3. Llamar al Banco Central
    let resultadoBC;
    try {
        resultadoBC = await bankService.enviarTransferencia({
            cbuOrigen,
            cbuDestino,
            importe: Number(importe),
            saldoOrigen: Number(cuentaOrigen.saldo)
        });
    } catch (errorBC) {
        const status = errorBC.response?.status;
        const dataBC = errorBC.response?.data;

        await supabase.from('transferencias').insert({
            id_cuenta_origen: cuentaOrigen.id_cuenta,
            cuenta_destino: cbuDestino,
            monto: importe,
            concepto: concepto || null,
            estado: 'rechazada',
            fecha_hora: new Date()
        });

        if (status === 422) return res.status(422).json({ mensaje: 'Saldo insuficiente según el Banco Central' });
        if (status === 404) return res.status(404).json({ mensaje: 'CBU destino no encontrado en el sistema interbancario' });
        if (status === 403) return res.status(403).json({ mensaje: 'El CBU origen no pertenece a CSBANK' });

        console.error('Error BC transferencia:', dataBC || errorBC.message);
        return res.status(500).json({ mensaje: 'Error en el Banco Central' });
    }

    // 4. Descontar saldo
    const nuevoSaldo = Number(cuentaOrigen.saldo) - Number(importe);
    const { error: errSaldo } = await supabase
        .from('cuentas')
        .update({ saldo: nuevoSaldo })
        .eq('id_cuenta', cuentaOrigen.id_cuenta);

    if (errSaldo) {
        console.error('⚠️ CRÍTICO: BC aprobó pero falló el descuento:', errSaldo);
        return res.status(500).json({ mensaje: 'Error al actualizar saldo' });
    }

    // 5. Guardar en transferencias
    await supabase.from('transferencias').insert({
        id_cuenta_origen: cuentaOrigen.id_cuenta,
        cuenta_destino: cbuDestino,
        monto: importe,
        concepto: concepto || null,
        estado: 'aprobada',
        fecha_hora: new Date()
    });

    // 6. Guardar en movimientos
    await supabase.from('movimientos').insert({
        id_cuenta: cuentaOrigen.id_cuenta,
        tipo_movimiento: 'debito',
        monto: importe,
        fecha_hora: new Date()
    });

    res.status(201).json({
        mensaje: 'Transferencia realizada correctamente',
        transaccionId: resultadoBC.transaccionId,
        estado: 'aprobada',
        cbuOrigen,
        cbuDestino,
        importe,
        nombreDestino: resultadoBC.nombreDestino || null
    });
};

// ─────────────────────────────────────────────
// GET /transactions/:cbu
// ─────────────────────────────────────────────
const getMovimientos = async (req, res) => {
    const { cbu } = req.params;

    const { data: cuenta, error: errCuenta } = await supabase
        .from('cuentas')
        .select('id_cuenta')
        .eq('cbu', cbu)
        .single();

    if (errCuenta || !cuenta) {
        return res.status(404).json({ mensaje: 'CBU no encontrado' });
    }

    const { data: transferencias, error: errTx } = await supabase
        .from('transferencias')
        .select('*')
        .eq('id_cuenta_origen', cuenta.id_cuenta)
        .order('fecha_hora', { ascending: false })
        .limit(50);

    if (errTx) {
        return res.status(500).json({ mensaje: 'Error al obtener movimientos' });
    }

    const { data: movimientos } = await supabase
        .from('movimientos')
        .select('*')
        .eq('id_cuenta', cuenta.id_cuenta)
        .order('fecha_hora', { ascending: false })
        .limit(50);

    res.json({
        transferencias_enviadas: transferencias || [],
        movimientos: movimientos || []
    });
};

module.exports = {
    getPersonByCBU,
    registrarPersona,
    realizarTransferencia,
    getMovimientos
};