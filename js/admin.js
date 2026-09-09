const dataInput = document.getElementById("data");
const dataSelecionada = document.getElementById("dataSelecionada");
const horariosContainer = document.getElementById("horarios");
const btnBloquear = document.getElementById("btnBloquear");

let modoBloqueio = false;
let horarioParaBloquear = null;

dataInput.addEventListener("change", carregarAgenda);

btnBloquear.addEventListener("click", gerenciarBloqueio);

function mostrarToast(mensagem) {
    const container = document.getElementById("toastContainer");

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = mensagem;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.add("show");
    });

    setTimeout(() => {
        toast.classList.remove("show");
        toast.addEventListener("transitionend", () => toast.remove(), { once: true });
    }, 3000);
}

function confirmarAcao(mensagemTexto) {
    return new Promise(resolve => {
        const modal = document.getElementById("modalConfirmar");
        const texto = document.getElementById("modalConfirmarTexto");
        const btnSim = document.getElementById("modalConfirmarSim");
        const btnNao = document.getElementById("modalConfirmarNao");

        texto.textContent = mensagemTexto;
        modal.style.display = "flex";

        function limpar(resultado) {
            modal.style.display = "none";
            btnSim.removeEventListener("click", simHandler);
            btnNao.removeEventListener("click", naoHandler);
            resolve(resultado);
        }

        function simHandler() { limpar(true); }
        function naoHandler() { limpar(false); }

        btnSim.addEventListener("click", simHandler);
        btnNao.addEventListener("click", naoHandler);
    });
}

async function carregarAgenda() {
    const data = dataInput.value;

    if (!data) {
        return;
    }

    try {
        const resposta = await fetch(
            `/api/admin/agendamentos/${data}`
        );

        const dados = await resposta.json();

        if (!dados.sucesso) {
            mostrarToast(dados.mensagem);
            return;
        }

        atualizarDataSelecionada(data);

        renderizarHorarios(
            dados.agendamentos || [],
            dados.bloqueios || []
        );

    } catch (erro) {
        console.error("Erro ao carregar agenda:", erro);
        mostrarToast("Não foi possível carregar a agenda.");
    }
}

function atualizarDataSelecionada(data) {
    const [ano, mes, dia] = data.split("-");

    dataSelecionada.textContent = `${dia}/${mes}/${ano}`;
}

function renderizarHorarios(agendamentos, bloqueios) {
    horariosContainer.innerHTML = "";

    for (let hora = 8; hora < 17; hora++) {
        renderizarHorario(hora, 0, agendamentos, bloqueios);
        renderizarHorario(hora, 30, agendamentos, bloqueios);
    }
}

function renderizarHorario(hora, minuto, agendamentos, bloqueios) {
    const horario = formatarHorario(hora, minuto);

    const agendamento = agendamentos.find(
        item => item.horario === horario
    );

    const bloqueio = bloqueios.find(
        item => item.horario === horario
    );

    const divHorario = document.createElement("div");

    divHorario.className = "horario";

    const horaElemento = document.createElement("strong");

    horaElemento.textContent = horario;

    divHorario.appendChild(horaElemento);

    if (agendamento) {
        renderizarAgendamento(divHorario, agendamento);
    } else if (bloqueio) {
        renderizarBloqueio(divHorario, bloqueio);
    } else {
        renderizarHorarioLivre(divHorario, horario);
    }

    horariosContainer.appendChild(divHorario);
}

function formatarHorario(hora, minuto) {
    const horaFormatada = String(hora).padStart(2, "0");
    const minutoFormatado = String(minuto).padStart(2, "0");

    return `${horaFormatada}:${minutoFormatado}`;
}

function renderizarAgendamento(divHorario, agendamento) {
    const informacoes = document.createElement("div");

    informacoes.className = "informacoes";

    const nome = document.createElement("span");

    nome.className = "status agendado-texto";
    nome.textContent = agendamento.nome;

    const btnCancelar = document.createElement("button");

    btnCancelar.className = "btn-cancelar";
    btnCancelar.textContent = "Cancelar";

    btnCancelar.addEventListener("click", () => {
        cancelarAgendamento(agendamento);
    });

    informacoes.append(nome, btnCancelar);

    divHorario.appendChild(informacoes);
}

function renderizarBloqueio(divHorario, bloqueio) {
    const informacoes = document.createElement("div");

    informacoes.className = "informacoes";

    const status = document.createElement("span");

    status.className = "status bloqueado-texto";
    status.textContent = "Bloqueado";

    const btnDesbloquear = document.createElement("button");

    btnDesbloquear.className = "btn-desbloquear";
    btnDesbloquear.textContent = "Desbloquear";

    btnDesbloquear.addEventListener("click", () => {
        desbloquearHorario(bloqueio);
    });

    informacoes.append(status, btnDesbloquear);

    divHorario.appendChild(informacoes);
}

function renderizarHorarioLivre(divHorario, horario) {
    const status = document.createElement("span");

    status.className = "status livre-texto";
    status.textContent = "Livre";

    divHorario.appendChild(status);

    if (!modoBloqueio) {
        return;
    }

    divHorario.classList.add("selecionavel");

    divHorario.addEventListener("click", () => {
        selecionarHorarioParaBloqueio(divHorario, horario);
    });
}

function selecionarHorarioParaBloqueio(divHorario, horario) {
    horarioParaBloquear = horario;

    document.querySelectorAll(".horario").forEach(item => {
        item.classList.remove("horario-selecionado");
    });

    divHorario.classList.add("horario-selecionado");

    btnBloquear.textContent = `Bloquear ${horario}`;
}

async function cancelarAgendamento(agendamento) {
    const confirmar = await confirmarAcao(
        `Deseja realmente cancelar o agendamento de ${agendamento.nome}?`
    );

    if (!confirmar) {
        return;
    }

    try {
        const resposta = await fetch(
            `/api/admin/agendamentos/${agendamento.id}/cancelar`,
            {
                method: "PUT"
            }
        );

        const dados = await resposta.json();

        if (!dados.sucesso) {
            mostrarToast(dados.mensagem);
            return;
        }

        mostrarToast("Agendamento cancelado com sucesso!");

        carregarAgenda();

    } catch (erro) {
        console.error("Erro ao cancelar agendamento:", erro);
        mostrarToast("Não foi possível cancelar o agendamento.");
    }
}

async function desbloquearHorario(bloqueio) {
    const confirmar = await confirmarAcao(
        "Deseja realmente desbloquear este horário?"
    );

    if (!confirmar) {
        return;
    }

    try {
        const resposta = await fetch(
            `/api/admin/bloqueios/${bloqueio.id}`,
            {
                method: "DELETE"
            }
        );

        const dados = await resposta.json();

        if (!dados.sucesso) {
            mostrarToast(dados.mensagem);
            return;
        }

        mostrarToast("Horário desbloqueado com sucesso!");

        carregarAgenda();

    } catch (erro) {
        console.error("Erro ao desbloquear horário:", erro);
        mostrarToast("Não foi possível desbloquear o horário.");
    }
}

async function gerenciarBloqueio() {
    if (!dataInput.value) {
        mostrarToast("Selecione uma data primeiro.");
        return;
    }

    if (!modoBloqueio) {
        ativarModoBloqueio();
        return;
    }

    if (!horarioParaBloquear) {
        mostrarToast("Selecione um horário para bloquear.");
        return;
    }

    await bloquearHorario();
}

function ativarModoBloqueio() {
    modoBloqueio = true;
    horarioParaBloquear = null;

    btnBloquear.textContent = "Selecione um horário";

    carregarAgenda();
}

async function bloquearHorario() {
    try {
        btnBloquear.disabled = true;

        const resposta = await fetch(
            "/api/admin/bloqueios",
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    data: dataInput.value,
                    horario: horarioParaBloquear
                })
            }
        );

        const dados = await resposta.json();

        if (!dados.sucesso) {
            mostrarToast(dados.mensagem);
            return;
        }

        mostrarToast("Horário bloqueado com sucesso!");

        finalizarModoBloqueio();

        carregarAgenda();

    } catch (erro) {
        console.error("Erro ao bloquear horário:", erro);
        mostrarToast("Não foi possível bloquear o horário.");

    } finally {
        btnBloquear.disabled = false;
    }
}

function finalizarModoBloqueio() {
    modoBloqueio = false;
    horarioParaBloquear = null;

    btnBloquear.textContent = "+ Bloquear horário";
}