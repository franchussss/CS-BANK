
let personas = [
    {
        cbu: "1234567890123456789012",
        nombre: "Fran",
        saldo: 1000
    }
];

const buscarPorCBU = (cbu) => {
    return personas.find(p => p.cbu === cbu);
};

module.exports = {
    buscarPorCBU
};
