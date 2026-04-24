let usuarios = [
    { id: 1, nombre: 'Fran', saldo: 1000 },
    { id: 2, nombre: 'Guille', saldo: 2000 }
];

const obtenerTodos = () => {
    return usuarios;
};

const agregarUsuario = (nuevoUsuario) => {
    usuarios.push(nuevoUsuario);
    return nuevoUsuario;
};

module.exports = { obtenerTodos, agregarUsuario };