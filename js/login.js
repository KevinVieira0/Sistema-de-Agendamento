const loginForm = document.getElementById("loginForm");
const cpfInput = document.getElementById("cpf");
const senhaInput = document.getElementById("senha");
const toggleSenha = document.getElementById("toggleSenha");
const iconeOlho = document.getElementById("iconeOlho");
const btnLogin = document.getElementById("btnLogin");

function mostrarToast(mensagem) {
    const toast = document.getElementById("toast");
    toast.textContent = mensagem;
    toast.classList.add("show");

    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

cpfInput.addEventListener("input", () => {
    const cpf = cpfInput.value
        .replace(/\D/g, "")
        .slice(0, 11);

    cpfInput.value = cpf
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d)/, "$1.$2")
        .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
});

toggleSenha.addEventListener("click", () => {
    const senhaVisivel = senhaInput.type === "text";

    senhaInput.type = senhaVisivel ? "password" : "text";

    toggleSenha.setAttribute(
        "aria-label",
        senhaVisivel ? "Mostrar senha" : "Ocultar senha"
    );

    iconeOlho.innerHTML = senhaVisivel
        ? `
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path>
            <circle cx="12" cy="12" r="3"></circle>
        `
        : `
            <path d="M3 3l18 18"></path>
            <path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.5 0 10 6 10 6a18.3 18.3 0 0 1-3.1 3.6"></path>
            <path d="M6.1 9.1C3.8 10.5 2 12 2 12s3.5 6 10 6c1.2 0 2.3-.2 3.3-.5"></path>
        `;
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const cpf = cpfInput.value;
    const senha = senhaInput.value;

    try {
        btnLogin.disabled = true;
        btnLogin.textContent = "Entrando...";

        const resposta = await fetch("/api/login", {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                cpf,
                senha
            })
        });

        const dados = await resposta.json();

        if (resposta.status === 429) {
            mostrarToast(dados.mensagem);
            btnLogin.textContent = "Bloqueado";

            setTimeout(() => {
                btnLogin.disabled = false;
                btnLogin.textContent = "Entrar";
            }, 15 * 60 * 1000);

            return;
        }

        if (!dados.sucesso) {
            mostrarToast(dados.mensagem);
            btnLogin.disabled = false;
            btnLogin.textContent = "Entrar";
            return;
        }

        window.location.href = "admin.html";

    } catch (erro) {
        console.error("Erro no login:", erro);

        mostrarToast("Não foi possível conectar ao servidor.");
        btnLogin.disabled = false;
        btnLogin.textContent = "Entrar";
    }
});