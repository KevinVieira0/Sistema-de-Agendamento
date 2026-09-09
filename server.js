const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = 3000;

const db = new Database(
    path.join(__dirname, "database", "database.db")
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || "chave-secreta-agendamento",
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production"
    }
}));

db.prepare(`
    CREATE TABLE IF NOT EXISTS administradores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        cpf TEXT NOT NULL UNIQUE,
        senha TEXT NOT NULL
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS agendamentos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        data TEXT NOT NULL,
        horario TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'agendado',
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS bloqueios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        data TEXT NOT NULL,
        horario TEXT NOT NULL,
        criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(data, horario)
    )
`).run();

function exigirLogin(req, res, next) {
    if (!req.session.administrador) {
        return res.status(401).json({
            sucesso: false,
            mensagem: "Acesso não autorizado."
        });
    }

    next();
}

function limparCpf(cpf) {
    return cpf.replace(/\D/g, "");
}

function responderErro(res, status, mensagem) {
    return res.status(status).json({
        sucesso: false,
        mensagem
    });
}

const tentativasLogin = new Map();

setInterval(() => {
    const agora = Date.now();
    const janela = 15 * 60 * 1000;
    for (const [ip, registro] of tentativasLogin.entries()) {
        if (agora - registro.inicio > janela) {
            tentativasLogin.delete(ip);
        }
    }
}, 30 * 60 * 1000);

function limiteLogin(req, res, next) {
    const ip = req.ip;
    const agora = Date.now();
    const janela = 15 * 60 * 1000;
    const maxTentativas = 5;

    const registro = tentativasLogin.get(ip);

    if (!registro || agora - registro.inicio > janela) {
        tentativasLogin.set(ip, { contagem: 0, inicio: agora });
        return next();
    }

    if (registro.contagem >= maxTentativas) {
        return res.status(429).json({
            sucesso: false,
            mensagem: "Muitas tentativas de login. Tente novamente em alguns minutos."
        });
    }

    next();
}

app.get("/admin.html", (req, res, next) => {
    if (!req.session.administrador) {
        return res.redirect("/login.html");
    }

    next();
});

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.post("/api/login", limiteLogin, (req, res) => {
    const { cpf, senha } = req.body;

    if (!cpf || !senha) {
        return responderErro(
            res,
            400,
            "Preencha o CPF e a senha."
        );
    }

    try {
        const cpfLimpo = limparCpf(cpf);

        const administrador = db.prepare(`
            SELECT id, nome, cpf, senha
            FROM administradores
            WHERE cpf = ?
        `).get(cpfLimpo);

        if (!administrador) {
            const registro = tentativasLogin.get(req.ip) || { contagem: 0, inicio: Date.now() };
            registro.contagem++;
            tentativasLogin.set(req.ip, registro);

            return responderErro(
                res,
                401,
                "CPF ou senha inválidos."
            );
        }

        const senhaCorreta = bcrypt.compareSync(
            senha,
            administrador.senha
        );

        if (!senhaCorreta) {
            const registro = tentativasLogin.get(req.ip) || { contagem: 0, inicio: Date.now() };
            registro.contagem++;
            tentativasLogin.set(req.ip, registro);

            return responderErro(
                res,
                401,
                "CPF ou senha inválidos."
            );
        }

        tentativasLogin.delete(req.ip);

        req.session.administrador = {
            id: administrador.id,
            nome: administrador.nome,
            cpf: administrador.cpf
        };

        res.json({
            sucesso: true,
            mensagem: "Login realizado com sucesso!"
        });

    } catch (erro) {
        console.error("Erro ao realizar login:", erro);

        responderErro(
            res,
            500,
            "Não foi possível realizar o login."
        );
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(erro => {
        if (erro) {
            return responderErro(
                res,
                500,
                "Não foi possível realizar o logout."
            );
        }

        res.clearCookie("connect.sid");

        res.json({
            sucesso: true,
            mensagem: "Logout realizado com sucesso!"
        });
    });
});

app.get("/api/admin/verificar", (req, res) => {
    if (!req.session.administrador) {
        return res.status(401).json({
            autenticado: false
        });
    }

    res.json({
        autenticado: true,
        administrador: req.session.administrador
    });
});

app.post("/api/agendamentos", (req, res) => {
    const { nome, data, horario } = req.body;

    if (!nome || !nome.trim() || !data || !horario) {
        return responderErro(res, 400, "Preencha todos os campos.");
    }

    const [ano, mes, dia] = data.split("-").map(Number);
    if (!ano || !mes || !dia) {
        return responderErro(res, 400, "Data inválida.");
    }

    const dataAgendamento = new Date(ano, mes - 1, dia);

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const dataLimite = new Date(hoje);
    dataLimite.setMonth(dataLimite.getMonth() + 2);

    if (dataAgendamento < hoje) {
        return responderErro(res, 400, "Data inválida.");
    }

    if (dataAgendamento > dataLimite) {
        return responderErro(res, 400, "Não é possível agendar com mais de 2 meses de antecedência.");
    }

    const horariosValidos = [];
    for (let hora = 8; hora < 17; hora++) {
        horariosValidos.push(`${String(hora).padStart(2, "0")}:00`);
        horariosValidos.push(`${String(hora).padStart(2, "0")}:30`);
    }

    if (!horariosValidos.includes(horario)) {
        return responderErro(res, 400, "Horário inválido.");
    }

    try {
        const agendamentoExistente = db.prepare(`
            SELECT id
            FROM agendamentos
            WHERE data = ?
            AND horario = ?
            AND status = 'agendado'
        `).get(data, horario);

        if (agendamentoExistente) {
            return responderErro(
                res,
                409,
                "Este horário já foi agendado."
            );
        }

        const bloqueioExistente = db.prepare(`
            SELECT id
            FROM bloqueios
            WHERE data = ?
            AND horario = ?
        `).get(data, horario);

        if (bloqueioExistente) {
            return responderErro(
                res,
                409,
                "Este horário está bloqueado."
            );
        }

        db.prepare(`
            INSERT INTO agendamentos (
                nome,
                data,
                horario
            )
            VALUES (?, ?, ?)
        `).run(
            nome.trim(),
            data,
            horario
        );

        res.status(201).json({
            sucesso: true,
            mensagem: "Agendamento realizado com sucesso!"
        });

    } catch (erro) {
        console.error("Erro ao criar agendamento:", erro);

        responderErro(
            res,
            500,
            "Erro ao realizar o agendamento."
        );
    }
});

app.get("/api/agendamentos/:data", (req, res) => {
    const { data } = req.params;

    try {
        const horarios = db.prepare(`
            SELECT horario
            FROM agendamentos
            WHERE data = ?
            AND status = 'agendado'
            ORDER BY horario
        `).all(data);

        const bloqueios = db.prepare(`
            SELECT horario
            FROM bloqueios
            WHERE data = ?
            ORDER BY horario
        `).all(data);

        res.json({
            sucesso: true,
            horarios,
            bloqueios
        });

    } catch (erro) {
        console.error("Erro ao buscar horários:", erro);

        responderErro(
            res,
            500,
            "Erro ao buscar os horários."
        );
    }
});

app.get(
    "/api/admin/agendamentos/:data",
    exigirLogin,
    (req, res) => {
        const { data } = req.params;

        try {
            const agendamentos = db.prepare(`
                SELECT
                    id,
                    nome,
                    data,
                    horario,
                    status
                FROM agendamentos
                WHERE data = ?
                AND status = 'agendado'
                ORDER BY horario
            `).all(data);

            const bloqueios = db.prepare(`
                SELECT
                    id,
                    data,
                    horario
                FROM bloqueios
                WHERE data = ?
                ORDER BY horario
            `).all(data);

            res.json({
                sucesso: true,
                agendamentos,
                bloqueios
            });

        } catch (erro) {
            console.error(
                "Erro ao buscar agenda administrativa:",
                erro
            );

            responderErro(
                res,
                500,
                "Erro ao buscar os agendamentos."
            );
        }
    }
);

app.put(
    "/api/admin/agendamentos/:id/cancelar",
    exigirLogin,
    (req, res) => {
        const { id } = req.params;

        try {
            const resultado = db.prepare(`
                UPDATE agendamentos
                SET status = 'cancelado'
                WHERE id = ?
                AND status = 'agendado'
            `).run(id);

            if (resultado.changes === 0) {
                return responderErro(
                    res,
                    404,
                    "Agendamento não encontrado ou já cancelado."
                );
            }

            res.json({
                sucesso: true,
                mensagem: "Agendamento cancelado com sucesso!"
            });

        } catch (erro) {
            console.error(
                "Erro ao cancelar agendamento:",
                erro
            );

            responderErro(
                res,
                500,
                "Erro ao cancelar o agendamento."
            );
        }
    }
);

app.post(
    "/api/admin/bloqueios",
    exigirLogin,
    (req, res) => {
        const { data, horario } = req.body;

        if (!data || !horario) {
            return responderErro(
                res,
                400,
                "Data e horário são obrigatórios."
            );
        }

        try {
            const agendamentoExistente = db.prepare(`
                SELECT id
                FROM agendamentos
                WHERE data = ?
                AND horario = ?
                AND status = 'agendado'
            `).get(data, horario);

            if (agendamentoExistente) {
                return responderErro(
                    res,
                    409,
                    "Não é possível bloquear um horário que já está agendado."
                );
            }

            db.prepare(`
                INSERT INTO bloqueios (
                    data,
                    horario
                )
                VALUES (?, ?)
            `).run(data, horario);

            res.status(201).json({
                sucesso: true,
                mensagem: "Horário bloqueado com sucesso!"
            });

        } catch (erro) {
            if (erro.code === "SQLITE_CONSTRAINT_UNIQUE") {
                return responderErro(
                    res,
                    409,
                    "Este horário já está bloqueado."
                );
            }

            console.error(
                "Erro ao bloquear horário:",
                erro
            );

            responderErro(
                res,
                500,
                "Erro ao bloquear o horário."
            );
        }
    }
);

app.delete(
    "/api/admin/bloqueios/:id",
    exigirLogin,
    (req, res) => {
        const { id } = req.params;

        try {
            const resultado = db.prepare(`
                DELETE FROM bloqueios
                WHERE id = ?
            `).run(id);

            if (resultado.changes === 0) {
                return responderErro(
                    res,
                    404,
                    "Bloqueio não encontrado."
                );
            }

            res.json({
                sucesso: true,
                mensagem: "Horário desbloqueado com sucesso!"
            });

        } catch (erro) {
            console.error(
                "Erro ao desbloquear horário:",
                erro
            );

            responderErro(
                res,
                500,
                "Erro ao desbloquear o horário."
            );
        }
    }
);

process.on("SIGINT", () => {
    db.close();
    process.exit(0);
});

app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});