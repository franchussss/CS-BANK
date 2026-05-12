const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;

// Si faltan variables, el servidor explota al arrancar con un mensaje claro
// Mejor fallar rápido que tener errores misteriosos más adelante
if (!url || !key) {
    throw new Error('❌ Faltan SUPABASE_URL o SUPABASE_KEY en el .env');
}

const supabase = createClient(url, key);

module.exports = supabase;
