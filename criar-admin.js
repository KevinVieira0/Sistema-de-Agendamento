require("dotenv").config();
const { createClient } = require("@libsql/client");
const bcrypt = require("bcrypt");
const readline = require("readline");

const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question("Nome do administrador: ", (nome) => {
    rl.question("CPF: ", (cpf) => {
        rl.question("Senha: ", async (senha) => {
            const senhaCriptografada = bcrypt.hashSync(senha, 10);

            try {
                await db.execute({
                    sql: `INSERT INTO administradores (nome, cpf, senha) VALUES (?, ?, ?)`,
                    args: [nome, cpf.replace(/\D/g, ""), senhaCriptografada]
                });

                console.log("Administrador criado com sucesso!");

            } catch (erro) {
                console.error("Erro ao criar administrador:", erro.message);
            }

            rl.close();
        });
    });
});