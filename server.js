require("dotenv").config();
const express = require("express");
const { createClient } = require("@libsql/client");
const bcrypt = require("bcrypt");
const session = require("express-session");

const app = express();
const PORT = process.env.PORT || 3000;

const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN
});

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

async function iniciarBanco() {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS administradores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            cpf TEXT NOT NULL UNIQUE,
            senha TEXT NOT NULL
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            data TEXT NOT NULL,
            horario TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'agendado',
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await db.execute(`
        CREATE TABLE IF NOT EXISTS bloqueios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            data TEXT NOT NULL,
            horario TEXT NOT NULL,
            criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(data, horario)
        )
    `);
}

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

app.get("/admin.html", (req, res, next) => {
    if (!req.session.administrador) {
        return res.redirect("/login.html");
    }
    next();
});

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/index.html");
});

app.use(express.static(__dirname, {
    index: false
}));

app.use(express.static(__dirname, {
    index: false
}));

app.post("/api/login", limiteLogin, async (req, res) => {
    const { cpf, senha } = req.body;

    if (!cpf || !senha) {
        return responderErro(res, 400, "Preencha o CPF e a senha.");
    }

    try {
        const cpfLimpo = limparCpf(cpf);

        const resultado = await db.execute({
            sql: `SELECT id, nome, cpf, senha FROM administradores WHERE cpf = ?`,
            args: [cpfLimpo]
        });

        const administrador = resultado.rows[0];

        if (!administrador) {
            const registro = tentativasLogin.get(req.ip) || { contagem: 0, inicio: Date.now() };
            registro.contagem++;
            tentativasLogin.set(req.ip, registro);

            return responderErro(res, 401, "CPF ou senha inválidos.");
        }

        const senhaCorreta = bcrypt.compareSync(senha, administrador.senha);

        if (!senhaCorreta) {
            const registro = tentativasLogin.get(req.ip) || { contagem: 0, inicio: Date.now() };
            registro.contagem++;
            tentativasLogin.set(req.ip, registro);

            return responderErro(res, 401, "CPF ou senha inválidos.");
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
        responderErro(res, 500, "Não foi possível realizar o login.");
    }
});

app.post("/api/logout", (req, res) => {
    req.session.destroy(erro => {
        if (erro) {
            return responderErro(res, 500, "Não foi possível realizar o logout.");
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
        return res.status(401).json({ autenticado: false });
    }

    res.json({
        autenticado: true,
        administrador: req.session.administrador
    });
});

app.post("/api/agendamentos", async (req, res) => {
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
        const agendamentoExistente = await db.execute({
            sql: `SELECT id FROM agendamentos WHERE data = ? AND horario = ? AND status = 'agendado'`,
            args: [data, horario]
        });

        if (agendamentoExistente.rows.length > 0) {
            return responderErro(res, 409, "Este horário já foi agendado.");
        }

        const bloqueioExistente = await db.execute({
            sql: `SELECT id FROM bloqueios WHERE data = ? AND horario = ?`,
            args: [data, horario]
        });

        if (bloqueioExistente.rows.length > 0) {
            return responderErro(res, 409, "Este horário está bloqueado.");
        }

        await db.execute({
            sql: `INSERT INTO agendamentos (nome, data, horario) VALUES (?, ?, ?)`,
            args: [nome.trim(), data, horario]
        });

        res.status(201).json({
            sucesso: true,
            mensagem: "Agendamento realizado com sucesso!"
        });

    } catch (erro) {
        console.error("Erro ao criar agendamento:", erro);
        responderErro(res, 500, "Erro ao realizar o agendamento.");
    }
});

app.get("/api/agendamentos/:data", async (req, res) => {
    const { data } = req.params;

    try {
        const horarios = await db.execute({
            sql: `SELECT horario FROM agendamentos WHERE data = ? AND status = 'agendado' ORDER BY horario`,
            args: [data]
        });

        const bloqueios = await db.execute({
            sql: `SELECT horario FROM bloqueios WHERE data = ? ORDER BY horario`,
            args: [data]
        });

        res.json({
            sucesso: true,
            horarios: horarios.rows,
            bloqueios: bloqueios.rows
        });

    } catch (erro) {
        console.error("Erro ao buscar horários:", erro);
        responderErro(res, 500, "Erro ao buscar os horários.");
    }
});

app.get("/api/admin/agendamentos/:data", exigirLogin, async (req, res) => {
    const { data } = req.params;

    try {
        const agendamentos = await db.execute({
            sql: `SELECT id, nome, data, horario, status FROM agendamentos WHERE data = ? AND status = 'agendado' ORDER BY horario`,
            args: [data]
        });

        const bloqueios = await db.execute({
            sql: `SELECT id, data, horario FROM bloqueios WHERE data = ? ORDER BY horario`,
            args: [data]
        });

        res.json({
            sucesso: true,
            agendamentos: agendamentos.rows,
            bloqueios: bloqueios.rows
        });

    } catch (erro) {
        console.error("Erro ao buscar agenda administrativa:", erro);
        responderErro(res, 500, "Erro ao buscar os agendamentos.");
    }
});

app.put("/api/admin/agendamentos/:id/cancelar", exigirLogin, async (req, res) => {
    const { id } = req.params;

    try {
        const resultado = await db.execute({
            sql: `UPDATE agendamentos SET status = 'cancelado' WHERE id = ? AND status = 'agendado'`,
            args: [id]
        });

        if (resultado.rowsAffected === 0) {
            return responderErro(res, 404, "Agendamento não encontrado ou já cancelado.");
        }

        res.json({
            sucesso: true,
            mensagem: "Agendamento cancelado com sucesso!"
        });

    } catch (erro) {
        console.error("Erro ao cancelar agendamento:", erro);
        responderErro(res, 500, "Erro ao cancelar o agendamento.");
    }
});

app.post("/api/admin/bloqueios", exigirLogin, async (req, res) => {
    const { data, horario } = req.body;

    if (!data || !horario) {
        return responderErro(res, 400, "Data e horário são obrigatórios.");
    }

    try {
        const agendamentoExistente = await db.execute({
            sql: `SELECT id FROM agendamentos WHERE data = ? AND horario = ? AND status = 'agendado'`,
            args: [data, horario]
        });

        if (agendamentoExistente.rows.length > 0) {
            return responderErro(res, 409, "Não é possível bloquear um horário que já está agendado.");
        }

        await db.execute({
            sql: `INSERT INTO bloqueios (data, horario) VALUES (?, ?)`,
            args: [data, horario]
        });

        res.status(201).json({
            sucesso: true,
            mensagem: "Horário bloqueado com sucesso!"
        });

    } catch (erro) {
        if (erro.message && erro.message.includes("UNIQUE")) {
            return responderErro(res, 409, "Este horário já está bloqueado.");
        }

        console.error("Erro ao bloquear horário:", erro);
        responderErro(res, 500, "Erro ao bloquear o horário.");
    }
});

app.delete("/api/admin/bloqueios/:id", exigirLogin, async (req, res) => {
    const { id } = req.params;

    try {
        const resultado = await db.execute({
            sql: `DELETE FROM bloqueios WHERE id = ?`,
            args: [id]
        });

        if (resultado.rowsAffected === 0) {
            return responderErro(res, 404, "Bloqueio não encontrado.");
        }

        res.json({
            sucesso: true,
            mensagem: "Horário desbloqueado com sucesso!"
        });

    } catch (erro) {
        console.error("Erro ao desbloquear horário:", erro);
        responderErro(res, 500, "Erro ao desbloquear o horário.");
    }
});

iniciarBanco().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor rodando em http://localhost:${PORT}`);
    });
}).catch(erro => {
    console.error("Erro ao iniciar o banco:", erro);
    process.exit(1);
});