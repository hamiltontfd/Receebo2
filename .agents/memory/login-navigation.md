---
name: Login navigation
description: User requirement for returning from authentication to the public landing page.
---

O login deve abrir em um modal, não em uma página inteira, e permitir voltar para
a landing page, inclusive no web app instalado.

**Why:** O usuário reiterou que a tela de login não pode impedir o retorno à
página inicial.

**How to apply:** Preserve uma saída visível sem depender dos controles do
navegador. Ao investigar diferenças entre o app instalado e a versão online,
compare as telas antes de atribuir o problema ao cache; um navegador novo não
prova qual versão ou endereço está aberto no dispositivo do usuário.
