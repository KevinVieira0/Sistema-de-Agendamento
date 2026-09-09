const btnSair = document.getElementById("btnSair");

btnSair.addEventListener("click", async () => {
    try {
        const resposta = await fetch("/api/logout", {
            method: "POST"
        });

        const dados = await resposta.json();

        if (dados.sucesso) {
            window.location.href = "login.html";
            return;
        }

        alert(dados.mensagem);

    } catch (erro) {
        console.error("Erro ao realizar logout:", erro);

        alert("Não foi possível realizar o logout.");
    }
});