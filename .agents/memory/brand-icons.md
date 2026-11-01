---
name: Brand icons
description: User requirements for Receebo browser and installed-app icons.
---
Every logo in the product uses the current Receebo mark from `artifacts/receiptr/public/logo.svg` (the header/landing logo), without the wordmark. Regenerate everything with `node artifacts/receiptr/scripts/generate-icons.mjs`.

- Favicon e ícones web padrão: recortados até o contorno preto arredondado, com transparência fora dele, sem placa ou margem branca externa. Preservar o branco interno.
- Apple touch e variantes opacas: acabamento escuro compatível com o contorno, sem margem branca. Maskable mantém o símbolo na área circular segura sobre fundo escuro.
- O gerador web não deve alterar incidentalmente assets do Expo nem os badges monocromáticos.
- Android push badge (`icons/badge-96.png`): white silhouette of the mark on transparent.

**Why:** O usuário rejeitou os cantos brancos no navegador e a placa branca com margens no Dock. Esta orientação substitui explicitamente o pedido anterior de fundo/padding branco.

**How to apply:** Preserve the original vector geometry when regenerating icons; never redraw the symbol by hand.

Installed iOS notification branding may retain the icon captured at installation, independently of the service worker's notification icon. Do not promise that replacing a push icon URL updates an existing iOS installation immediately.

**Why:** The owner reported an old filled symbol in iOS notifications even while production served the current outlined mark successfully.

**How to apply:** Keep Apple touch and manifest icons consistent with push artwork. Verify actual installed-device behavior separately; distinguish that from successful asset/build checks.

O carregamento inicial do web/PWA deve mostrar uma pequena animação do logo
com o slogan, em vez de apresentar o cartão de termos enquanto a verificação
ainda está pendente.

**Why:** O usuário considerou inadequado o carregamento dentro de “Before you
continue” e pediu explicitamente logo animado com slogan.

**How to apply:** Separar a apresentação de carregamento da necessidade real de
consentimento. Não atrasar a entrada artificialmente nem ocultar erros ou
dispensar a confirmação dos termos.
