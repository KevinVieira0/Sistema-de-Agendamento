const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const readline = require("readline");

const db = new Database(
    path.join(__dirname, "database", "database.db")
);

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

rl.question("Nome do administrador: ", (nome) => {
    rl.question("CPF: ", (cpf) => {
        rl.question("Senha: ", (senha) => {
            const senhaCriptografada = bcrypt.hashSync(senha, 10);

            try {
                db.prepare(`
                    INSERT INTO administradores (nome, cpf, senha)
                    VALUES (?, ?, ?)
                `).run(
                    nome,
                    cpf.replace(/\D/g, ""),
                    senhaCriptografada
                );

                console.log("Administrador criado com sucesso!");

            } catch (erro) {
                console.error("Erro ao criar administrador:", erro.message);
            }

            db.close();
            rl.close();
        });
    });
});