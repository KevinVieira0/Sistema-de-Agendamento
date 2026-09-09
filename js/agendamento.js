const formAgendamento = document.getElementById("formAgendamento");
const nomeInput = document.getElementById("nome");
const dataInput = document.getElementById("data");
const horariosContainer = document.getElementById("horarios");
const btnConfirmar = document.getElementById("btnConfirmar");
const modal = document.getElementById("modalConfirmacao");
const mensagem = document.getElementById("mensagemAgendamento");
const fecharModal = document.getElementById("fecharModal");

let horarioSelecionado = null;

dataInput.addEventListener("change", carregarHorarios);
formAgendamento.addEventListener("submit", realizarAgendamento);
fecharModal.addEventListener("click", fecharConfirmacao);

definirDataMinima();

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

function definirDataMinima() {
    const dataMinima = new Date();

    dataMinima.setDate(dataMinima.getDate() + 1);

    const ano = dataMinima.getFullYear();
    const mes = String(dataMinima.getMonth() + 1).padStart(2, "0");
    const dia = String(dataMinima.getDate()).padStart(2, "0");

    dataInput.min = `${ano}-${mes}-${dia}`;
    
    const dataMaxima = new Date();
    dataMaxima.setMonth(dataMaxima.getMonth() + 2);

    dataInput.min = formatarParaInput(dataMinima);
    dataInput.max = formatarParaInput(dataMaxima);
}


function formatarParaInput(dataObj) {
    const ano = dataObj.getFullYear();
    const mes = String(dataObj.getMonth() + 1).padStart(2, "0");
    const dia = String(dataObj.getDate()).padStart(2, "0");

    return `${ano}-${mes}-${dia}`;
}

async function carregarHorarios() {
    const data = dataInput.value;

    if (!data) {
        return;
    }

    resetarHorarios();

    try {
        const resposta = await fetch(`/api/agendamentos/${data}`);
        const dados = await resposta.json();

        if (!dados.sucesso) {
            mostrarToast(dados.mensagem);
            return;
        }

        const horariosOcupados = (dados.horarios || []).map(
            item => item.horario
        );

        const horariosBloqueados = (dados.bloqueios || []).map(
            item => item.horario
        );

        criarHorarios(
            horariosOcupados,
            horariosBloqueados
        );

    } catch (erro) {
        console.error("Erro ao buscar horários:", erro);
        mostrarToast("Não foi possível carregar os horários.");
    }
}

function resetarHorarios() {
    horariosContainer.innerHTML = "";
    horarioSelecionado = null;
    btnConfirmar.disabled = true;
}

function criarHorarios(horariosOcupados, horariosBloqueados) {
    for (let hora = 8; hora < 17; hora++) {
        criarBotaoHorario(
            hora,
            0,
            horariosOcupados,
            horariosBloqueados
        );

        criarBotaoHorario(
            hora,
            30,
            horariosOcupados,
            horariosBloqueados
        );
    }
}

function criarBotaoHorario(
    hora,
    minuto,
    horariosOcupados,
    horariosBloqueados
) {
    const horario = formatarHorario(hora, minuto);

    const botao = document.createElement("button");

    botao.type = "button";
    botao.className = "horario";
    botao.textContent = horario;

    const estaOcupado = horariosOcupados.includes(horario);
    const estaBloqueado = horariosBloqueados.includes(horario);

    if (estaOcupado) {
        botao.disabled = true;
        botao.classList.add("ocupado");
    }

    if (estaBloqueado) {
        botao.disabled = true;
        botao.classList.add("bloqueado");
    }

    if (!estaOcupado && !estaBloqueado) {
        botao.addEventListener("click", () => {
            selecionarHorario(botao, horario);
        });
    }

    horariosContainer.appendChild(botao);
}

function formatarHorario(hora, minuto) {
    const horaFormatada = String(hora).padStart(2, "0");
    const minutoFormatado = String(minuto).padStart(2, "0");

    return `${horaFormatada}:${minutoFormatado}`;
}

function selecionarHorario(botaoSelecionado, horario) {
    document.querySelectorAll(".horario").forEach(botao => {
        botao.classList.remove("selecionado");
    });

    botaoSelecionado.classList.add("selecionado");

    horarioSelecionado = horario;
    btnConfirmar.disabled = false;
}

async function realizarAgendamento(event) {
    event.preventDefault();

    const nome = nomeInput.value.trim();
    const data = dataInput.value;

    if (!horarioSelecionado) {
        mostrarToast("Selecione um horário.");
        return;
    }

    try {
        btnConfirmar.disabled = true;
        btnConfirmar.textContent = "Confirmando...";

        const resposta = await fetch("/api/agendamentos", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                nome,
                data,
                horario: horarioSelecionado
            })
        });

        const dados = await resposta.json();

        if (!dados.sucesso) {
            mostrarToast(dados.mensagem);
            restaurarBotaoConfirmar();
            return;
        }

        mostrarConfirmacao(
            nome,
            data,
            horarioSelecionado
        );

    } catch (erro) {
        console.error("Erro ao realizar agendamento:", erro);
        mostrarToast("Não foi possível realizar o agendamento.");
        restaurarBotaoConfirmar();
    }
}

function mostrarConfirmacao(nome, data, horario) {
    const dataFormatada = formatarData(data);

    mensagem.innerHTML = `
        <strong>${nome}</strong>, seu horário foi reservado com sucesso.<br><br>
        <strong>Data:</strong> ${dataFormatada}<br>
        <strong>Horário:</strong> ${horario}
    `;

    modal.style.display = "flex";
}

function formatarData(data) {
    const [ano, mes, dia] = data.split("-");

    return `${dia}/${mes}/${ano}`;
}

function fecharConfirmacao() {
    modal.style.display = "none";

    const dataAgendada = dataInput.value;

    formAgendamento.reset();

    dataInput.value = dataAgendada;

    horarioSelecionado = null;

    restaurarBotaoConfirmar();

    carregarHorarios();
}

function restaurarBotaoConfirmar() {
    btnConfirmar.disabled = true;
    btnConfirmar.textContent = "Confirmar agendamento";
}