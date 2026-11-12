import { lt } from "@/lib/landingLocale";
import type { MediaMarket } from "./MarketingMedia";

/**
 * Factual copy for each v4 capture batch. Language follows the visitor (lt),
 * but every store, amount, date and rule follows the media batch shown, so the
 * words always describe what is actually on screen. All samples are fictional;
 * extraction in the recordings is simulated.
 */
export type MediaCopy = {
  heroLibraryAlt: string;
  heroReceiptAlt: string;
  heroCaption: string;
  demoCapture: string;
  demoFind: string;
  demoProtect: string;
  whyCaptureAlt: string;
  whyFindAlt: string;
  whyProtectAlt: string;
  whyProveAlt: string;
  protectionAlt: string;
  protectionCaption: string;
  promoStillAlt: string;
};

const SAMPLE = () => lt(
  "Real Receebo screens. Fictional sample purchases and simulated extraction.",
  "Ecrãs reais do Receebo. Compras de exemplo fictícias e extração simulada.",
  "Telas reais do Receebo. Compras de exemplo fictícias e extração simulada.",
);

function eu(): MediaCopy {
  return {
    heroLibraryAlt: lt(
      "Actual Receebo library screen on a phone, listing fictional purchases led by a 649,00 € Casa Lumen Eletrónica TV.",
      "Ecrã real da biblioteca do Receebo num telemóvel, com compras fictícias, a primeira uma TV Casa Lumen Eletrónica de 649,00 €.",
      "Tela real da biblioteca do Receebo em um celular, com compras fictícias, a primeira uma TV Casa Lumen Eletrónica de 649,00 €.",
    ),
    heroReceiptAlt: lt(
      "Actual Receebo receipt detail screen for the fictional Casa Lumen Eletrónica purchase of 23 out 2026: a 649,00 € 55-inch 4K Smart TV.",
      "Ecrã real de detalhe do recibo da compra fictícia na Casa Lumen Eletrónica a 23 out 2026: uma Smart TV 4K de 55 polegadas por 649,00 €.",
      "Tela real de detalhe do recibo da compra fictícia na Casa Lumen Eletrónica em 23 out 2026: uma Smart TV 4K de 55 polegadas por 649,00 €.",
    ),
    heroCaption: SAMPLE(),
    demoCapture: lt(
      "A sample receipt image is selected, the extracted merchant Casa Lumen Eletrónica, the date 23 October 2026 and the 649,00 € total are reviewed, and the purchase is saved. Extraction responses are simulated for this recording.",
      "É escolhida a imagem de um recibo de exemplo, o comerciante Casa Lumen Eletrónica, a data de 23 de outubro de 2026 e o total de 649,00 € extraídos são revistos e a compra é guardada. As respostas da extração são simuladas nesta gravação.",
      "É escolhida a imagem de um recibo de exemplo, a loja Casa Lumen Eletrónica, a data de 23 de outubro de 2026 e o total de 649,00 € extraídos são revisados e a compra é salva. As respostas da extração são simuladas nesta gravação.",
    ),
    demoFind: lt(
      "Typing “TV” filters the sample library to Casa Lumen Eletrónica. Opening the result shows the purchased item and the original receipt.",
      "Escrever “TV” filtra a biblioteca de exemplo para a Casa Lumen Eletrónica. Abrir o resultado mostra o artigo comprado e o recibo original.",
      "Digitar “TV” filtra a biblioteca de exemplo para a Casa Lumen Eletrónica. Abrir o resultado mostra o item comprado e o recibo original.",
    ),
    demoProtect: lt(
      "The sample online TV purchase (bought 23 October, delivered 25 October 2026) shows the return window until 8 November 2026, an estimated 2-year manufacturer warranty until 23 October 2028 and an estimated 3-year legal guarantee in Portugal until 25 October 2029. Dates depend on purchase details; eligibility and exclusions must be checked with the seller.",
      "A compra online de exemplo de uma TV (comprada a 23 de outubro, entregue a 25 de outubro de 2026) mostra o prazo de devolução até 8 de novembro de 2026, a garantia do fabricante estimada de 2 anos até 23 de outubro de 2028 e a garantia legal estimada de 3 anos em Portugal até 25 de outubro de 2029. As datas dependem dos detalhes da compra; a elegibilidade e as exclusões devem ser confirmadas com o vendedor.",
      "A compra online de exemplo de uma TV (comprada em 23 de outubro, entregue em 25 de outubro de 2026) mostra o prazo de devolução até 8 de novembro de 2026, a garantia do fabricante estimada de 2 anos até 23 de outubro de 2028 e a garantia legal estimada de 3 anos em Portugal até 25 de outubro de 2029. As datas dependem dos detalhes da compra; a elegibilidade e as exclusões devem ser confirmadas com o vendedor.",
    ),
    whyCaptureAlt: lt(
      "Receebo's real review form displaying Casa Lumen Eletrónica, 23 October 2026 and a 649,00 € total from a fictional receipt.",
      "Formulário real de revisão do Receebo com Casa Lumen Eletrónica, 23 de outubro de 2026 e um total de 649,00 € de um recibo fictício.",
    ),
    whyFindAlt: lt(
      "A search for TV in the real Receebo interface finds the fictional Casa Lumen Eletrónica purchase.",
      "Uma pesquisa por TV na interface real do Receebo encontra a compra fictícia na Casa Lumen Eletrónica.",
    ),
    whyProtectAlt: lt(
      "Real Receebo protection screen for the fictional online TV purchase: return by 8 November 2026, estimated manufacturer warranty to 23 October 2028, estimated legal guarantee to 25 October 2029.",
      "Ecrã real de proteção do Receebo para a compra online fictícia da TV: devolução até 8 de novembro de 2026, garantia do fabricante estimada até 23 de outubro de 2028, garantia legal estimada até 25 de outubro de 2029.",
      "Tela real de proteção do Receebo para a compra online fictícia da TV: devolução até 8 de novembro de 2026, garantia do fabricante estimada até 23 de outubro de 2028, garantia legal estimada até 25 de outubro de 2029.",
    ),
    whyProveAlt: lt(
      "Receebo's full-screen Show to store view displaying the fictional Casa Lumen Eletrónica receipt for a 649,00 € 55-inch 4K Smart TV.",
      "Vista de ecrã inteiro do Receebo para mostrar na loja, com o recibo fictício da Casa Lumen Eletrónica de uma Smart TV 4K de 55 polegadas por 649,00 €.",
      "Visualização em tela cheia do Receebo para mostrar na loja, com o recibo fictício da Casa Lumen Eletrónica de uma Smart TV 4K de 55 polegadas por 649,00 €.",
    ),
    protectionAlt: lt(
      "Real Receebo protection panel for a fictional online TV purchase in Portugal, bought 23 October and delivered 25 October 2026: return window until 8 November 2026, estimated 2-year manufacturer warranty until 23 October 2028 and estimated 3-year legal guarantee until 25 October 2029.",
      "Painel real de proteção do Receebo para uma compra online fictícia de uma TV em Portugal, comprada a 23 de outubro e entregue a 25 de outubro de 2026: devolução até 8 de novembro de 2026, garantia do fabricante estimada de 2 anos até 23 de outubro de 2028 e garantia legal estimada de 3 anos até 25 de outubro de 2029.",
      "Painel real de proteção do Receebo para uma compra online fictícia de uma TV em Portugal, comprada em 23 de outubro e entregue em 25 de outubro de 2026: devolução até 8 de novembro de 2026, garantia do fabricante estimada de 2 anos até 23 de outubro de 2028 e garantia legal estimada de 3 anos até 25 de outubro de 2029.",
    ),
    protectionCaption: lt(
      "Fictional online purchase in Portugal. Estimated dates; general guidance, not a guarantee of eligibility.",
      "Compra online fictícia em Portugal. Datas estimadas; orientação geral, não garante elegibilidade.",
    ),
    promoStillAlt: lt(
      "Real Receebo library screen with fictional purchases led by a Casa Lumen Eletrónica TV.",
      "Ecrã real da biblioteca do Receebo com compras fictícias, a primeira uma TV da Casa Lumen Eletrónica.",
      "Tela real da biblioteca do Receebo com compras fictícias, a primeira uma TV da Casa Lumen Eletrónica.",
    ),
  };
}

function us(): MediaCopy {
  return {
    heroLibraryAlt: lt(
      "Actual Receebo library screen on a phone, listing fictional purchases led by a $486 Northwind Supply order from November 2, 2026.",
      "Ecrã real da biblioteca do Receebo num telemóvel, com compras fictícias, a primeira uma encomenda Northwind Supply de 486 dólares de 2 de novembro de 2026.",
      "Tela real da biblioteca do Receebo em um celular, com compras fictícias, a primeira um pedido Northwind Supply de 486 dólares de 2 de novembro de 2026.",
    ),
    heroReceiptAlt: lt(
      "Actual Receebo receipt screen for the fictional Northwind Supply order: a $360 55-inch display, return by December 2, 2026, and a $90 shelf speaker, return by December 17, 2026.",
      "Ecrã real do recibo da encomenda fictícia Northwind Supply: um ecrã de 55 polegadas por 360 dólares, devolução até 2 de dezembro de 2026, e uma coluna de prateleira por 90 dólares, devolução até 17 de dezembro de 2026.",
      "Tela real do recibo do pedido fictício Northwind Supply: uma tela de 55 polegadas por 360 dólares, devolução até 2 de dezembro de 2026, e uma caixa de som de prateleira por 90 dólares, devolução até 17 de dezembro de 2026.",
    ),
    heroCaption: lt(
      "Real Receebo screens of a fictional Northwind Supply order, not a real store. Return dates are estimated from sample store terms; warranties shown are the manufacturer's, not a US legal guarantee.",
      "Ecrãs reais do Receebo de uma encomenda fictícia da Northwind Supply, não de uma loja real. Os prazos de devolução são estimados a partir de condições de exemplo; as garantias mostradas são do fabricante, não uma garantia legal dos EUA.",
      "Telas reais do Receebo de um pedido fictício da Northwind Supply, não de uma loja real. Os prazos de devolução são estimados a partir de condições de exemplo; as garantias mostradas são do fabricante, não uma garantia legal dos EUA.",
    ),
    demoCapture: lt(
      "A sample receipt image is selected, the extracted merchant Northwind Supply, the date November 2, 2026 and the $486 total are reviewed, and the purchase is saved. Extraction responses are simulated for this recording.",
      "É escolhida a imagem de um recibo de exemplo, o comerciante Northwind Supply, a data de 2 de novembro de 2026 e o total de 486 dólares extraídos são revistos e a compra é guardada. As respostas da extração são simuladas nesta gravação.",
      "É escolhida a imagem de um recibo de exemplo, a loja Northwind Supply, a data de 2 de novembro de 2026 e o total de 486 dólares extraídos são revisados e a compra é salva. As respostas da extração são simuladas nesta gravação.",
    ),
    demoFind: lt(
      "Typing “display” filters the sample library to Northwind Supply. Opening the result shows the 55-inch display and the original receipt.",
      "Escrever “display” filtra a biblioteca de exemplo para a Northwind Supply. Abrir o resultado mostra o ecrã de 55 polegadas e o recibo original.",
      "Digitar “display” filtra a biblioteca de exemplo para a Northwind Supply. Abrir o resultado mostra a tela de 55 polegadas e o recibo original.",
    ),
    demoProtect: lt(
      "The sample order shows, per item, an estimated return date and the manufacturer warranty: the $360 55-inch display returns by December 2, 2026 with a 2-year manufacturer warranty to November 2, 2028; the $90 shelf speaker returns by December 17, 2026 with an 18-month manufacturer warranty to May 2, 2028. No legal warranty is shown for the US. Always check the store's terms.",
      "A encomenda de exemplo mostra, por artigo, uma data de devolução estimada e a garantia do fabricante: o ecrã de 55 polegadas de 360 dólares devolve-se até 2 de dezembro de 2026, com garantia do fabricante de 2 anos até 2 de novembro de 2028; a coluna de 90 dólares devolve-se até 17 de dezembro de 2026, com garantia do fabricante de 18 meses até 2 de maio de 2028. Nos EUA não é mostrada garantia legal. Confirma sempre as condições da loja.",
      "O pedido de exemplo mostra, por item, uma data de devolução estimada e a garantia do fabricante: a tela de 55 polegadas de 360 dólares pode ser devolvida até 2 de dezembro de 2026, com garantia do fabricante de 2 anos até 2 de novembro de 2028; a caixa de som de 90 dólares até 17 de dezembro de 2026, com garantia do fabricante de 18 meses até 2 de maio de 2028. Nos EUA não é mostrada garantia legal. Sempre confira as condições da loja.",
    ),
    whyCaptureAlt: lt(
      "Receebo's real review form displaying Northwind Supply, November 2, 2026 and a $486 total from a fictional receipt.",
      "Formulário real de revisão do Receebo com Northwind Supply, 2 de novembro de 2026 e um total de 486 dólares de um recibo fictício.",
    ),
    whyFindAlt: lt(
      "A search for display in the real Receebo interface finds the fictional Northwind Supply order.",
      "Uma pesquisa por display na interface real do Receebo encontra a encomenda fictícia da Northwind Supply.",
      "Uma pesquisa por display na interface real do Receebo encontra o pedido fictício da Northwind Supply.",
    ),
    whyProtectAlt: lt(
      "Real Receebo protection screen for the fictional Northwind Supply order: display return by December 2, 2026 and manufacturer warranty to November 2, 2028; shelf speaker return by December 17, 2026 and manufacturer warranty to May 2, 2028.",
      "Ecrã real de proteção do Receebo para a encomenda fictícia Northwind Supply: ecrã com devolução até 2 de dezembro de 2026 e garantia do fabricante até 2 de novembro de 2028; coluna com devolução até 17 de dezembro de 2026 e garantia do fabricante até 2 de maio de 2028.",
      "Tela real de proteção do Receebo para o pedido fictício Northwind Supply: tela com devolução até 2 de dezembro de 2026 e garantia do fabricante até 2 de novembro de 2028; caixa de som com devolução até 17 de dezembro de 2026 e garantia do fabricante até 2 de maio de 2028.",
    ),
    whyProveAlt: lt(
      "Receebo's full-screen Show to store view displaying the fictional Northwind Supply receipt with a $360 55-inch display and a $90 shelf speaker.",
      "Vista de ecrã inteiro do Receebo para mostrar na loja, com o recibo fictício da Northwind Supply de um ecrã de 55 polegadas por 360 dólares e uma coluna por 90 dólares.",
      "Visualização em tela cheia do Receebo para mostrar na loja, com o recibo fictício da Northwind Supply de uma tela de 55 polegadas por 360 dólares e uma caixa de som por 90 dólares.",
    ),
    protectionAlt: lt(
      "Real Receebo protection panel for the fictional Northwind Supply order: estimated return dates of December 2 and December 17, 2026 and manufacturer warranties to November 2, 2028 and May 2, 2028.",
      "Painel real de proteção do Receebo para a encomenda fictícia Northwind Supply: devoluções estimadas até 2 e 17 de dezembro de 2026 e garantias do fabricante até 2 de novembro de 2028 e 2 de maio de 2028.",
      "Painel real de proteção do Receebo para o pedido fictício Northwind Supply: devoluções estimadas até 2 e 17 de dezembro de 2026 e garantias do fabricante até 2 de novembro de 2028 e 2 de maio de 2028.",
    ),
    protectionCaption: lt(
      "Fictional US order. Estimated return dates and manufacturer warranties only; no US legal warranty is shown.",
      "Encomenda fictícia nos EUA. Apenas devoluções estimadas e garantias do fabricante; não é mostrada garantia legal dos EUA.",
      "Pedido fictício nos EUA. Apenas devoluções estimadas e garantias do fabricante; não é mostrada garantia legal dos EUA.",
    ),
    promoStillAlt: lt(
      "Real Receebo library screen with fictional purchases led by a Northwind Supply order.",
      "Ecrã real da biblioteca do Receebo com compras fictícias, a primeira uma encomenda Northwind Supply.",
      "Tela real da biblioteca do Receebo com compras fictícias, a primeira um pedido Northwind Supply.",
    ),
  };
}

function br(): MediaCopy {
  return {
    heroLibraryAlt: lt(
      "Actual Receebo library screen on a phone, listing fictional purchases led by an R$3.199,00 Loja Fictícia Aurora de Papel order from 2 November 2026.",
      "Ecrã real da biblioteca do Receebo num telemóvel, com compras fictícias, a primeira uma compra de R$3.199,00 na Loja Fictícia Aurora de Papel a 2 de novembro de 2026.",
      "Tela real da biblioteca do Receebo em um celular, com compras fictícias, a primeira uma compra de R$3.199,00 na Loja Fictícia Aurora de Papel em 2 de novembro de 2026.",
    ),
    heroReceiptAlt: lt(
      "Actual Receebo receipt screen for the fictional Loja Fictícia Aurora de Papel online purchase: a TV for R$2.499,00 and a soundbar for R$649,00.",
      "Ecrã real do recibo da compra online fictícia na Loja Fictícia Aurora de Papel: uma TV por R$2.499,00 e uma soundbar por R$649,00.",
      "Tela real do recibo da compra online fictícia na Loja Fictícia Aurora de Papel: uma TV por R$2.499,00 e uma soundbar por R$649,00.",
    ),
    heroCaption: SAMPLE(),
    demoCapture: lt(
      "A sample receipt image is selected, the extracted merchant Loja Fictícia Aurora de Papel, the date 2 November 2026 and the R$3.199,00 total are reviewed, and the purchase is saved. Extraction responses are simulated for this recording.",
      "É escolhida a imagem de um recibo de exemplo, o comerciante Loja Fictícia Aurora de Papel, a data de 2 de novembro de 2026 e o total de R$3.199,00 extraídos são revistos e a compra é guardada. As respostas da extração são simuladas nesta gravação.",
      "É escolhida a imagem de um recibo de exemplo, a loja Loja Fictícia Aurora de Papel, a data de 2 de novembro de 2026 e o total de R$3.199,00 extraídos são revisados e a compra é salva. As respostas da extração são simuladas nesta gravação.",
    ),
    demoFind: lt(
      "Typing “TV” filters the sample library to Loja Fictícia Aurora de Papel. Opening the result shows the TV and the original receipt.",
      "Escrever “TV” filtra a biblioteca de exemplo para a Loja Fictícia Aurora de Papel. Abrir o resultado mostra a TV e o recibo original.",
      "Digitar “TV” filtra a biblioteca de exemplo para a Loja Fictícia Aurora de Papel. Abrir o resultado mostra a TV e o recibo original.",
    ),
    demoProtect: lt(
      "The sample online purchase in Brazil shows the 7-day withdrawal right until 12 November 2026, the TV's 2-year manufacturer warranty until 2 November 2028 and an estimated 90-day legal guarantee until 3 February 2027. Dates depend on purchase details; eligibility must be checked with the seller.",
      "A compra online de exemplo no Brasil mostra o direito de arrependimento até 12 de novembro de 2026, a garantia do fabricante da TV de 2 anos até 2 de novembro de 2028 e a garantia legal estimada de 90 dias até 3 de fevereiro de 2027. As datas dependem dos detalhes da compra; a elegibilidade deve ser confirmada com o vendedor.",
      "A compra online de exemplo no Brasil mostra o direito de arrependimento até 12 de novembro de 2026, a garantia do fabricante da TV de 2 anos até 2 de novembro de 2028 e a garantia legal estimada de 90 dias até 3 de fevereiro de 2027. As datas dependem dos detalhes da compra; a elegibilidade deve ser confirmada com o vendedor.",
    ),
    whyCaptureAlt: lt(
      "Receebo's real review form displaying Loja Fictícia Aurora de Papel, 2 November 2026 and an R$3.199,00 total from a fictional receipt.",
      "Formulário real de revisão do Receebo com Loja Fictícia Aurora de Papel, 2 de novembro de 2026 e um total de R$3.199,00 de um recibo fictício.",
    ),
    whyFindAlt: lt(
      "A search for TV in the real Receebo interface finds the fictional Loja Fictícia Aurora de Papel purchase.",
      "Uma pesquisa por TV na interface real do Receebo encontra a compra fictícia na Loja Fictícia Aurora de Papel.",
    ),
    whyProtectAlt: lt(
      "Real Receebo protection screen for the fictional online purchase in Brazil: withdrawal until 12 November 2026, TV manufacturer warranty to 2 November 2028, estimated 90-day legal guarantee to 3 February 2027.",
      "Ecrã real de proteção do Receebo para a compra online fictícia no Brasil: arrependimento até 12 de novembro de 2026, garantia do fabricante da TV até 2 de novembro de 2028, garantia legal estimada de 90 dias até 3 de fevereiro de 2027.",
      "Tela real de proteção do Receebo para a compra online fictícia no Brasil: arrependimento até 12 de novembro de 2026, garantia do fabricante da TV até 2 de novembro de 2028, garantia legal estimada de 90 dias até 3 de fevereiro de 2027.",
    ),
    whyProveAlt: lt(
      "Receebo's full-screen Show to store view displaying the fictional Loja Fictícia Aurora de Papel receipt for an R$2.499,00 TV and an R$649,00 soundbar.",
      "Vista de ecrã inteiro do Receebo para mostrar na loja, com o recibo fictício da Loja Fictícia Aurora de Papel de uma TV por R$2.499,00 e uma soundbar por R$649,00.",
      "Visualização em tela cheia do Receebo para mostrar na loja, com o recibo fictício da Loja Fictícia Aurora de Papel de uma TV por R$2.499,00 e uma soundbar por R$649,00.",
    ),
    protectionAlt: lt(
      "Real Receebo consumer-rights panel for a fictional online purchase in Brazil on 2 November 2026: withdrawal right until 12 November 2026, 2-year TV manufacturer warranty until 2 November 2028 and estimated 90-day legal guarantee until 3 February 2027.",
      "Painel real de direitos do consumidor do Receebo para uma compra online fictícia no Brasil a 2 de novembro de 2026: arrependimento até 12 de novembro de 2026, garantia do fabricante da TV de 2 anos até 2 de novembro de 2028 e garantia legal estimada de 90 dias até 3 de fevereiro de 2027.",
      "Painel real de direitos do consumidor do Receebo para uma compra online fictícia no Brasil em 2 de novembro de 2026: arrependimento até 12 de novembro de 2026, garantia do fabricante da TV de 2 anos até 2 de novembro de 2028 e garantia legal estimada de 90 dias até 3 de fevereiro de 2027.",
    ),
    protectionCaption: lt(
      "Fictional online purchase in Brazil. Estimated dates; general guidance, not a guarantee of eligibility.",
      "Compra online fictícia no Brasil. Datas estimadas; orientação geral, não garante elegibilidade.",
    ),
    promoStillAlt: lt(
      "Real Receebo library screen with fictional purchases led by a Loja Fictícia Aurora de Papel order.",
      "Ecrã real da biblioteca do Receebo com compras fictícias, a primeira da Loja Fictícia Aurora de Papel.",
      "Tela real da biblioteca do Receebo com compras fictícias, a primeira da Loja Fictícia Aurora de Papel.",
    ),
  };
}

export function mediaCopy(market: MediaMarket): MediaCopy {
  return market === "us" ? us() : market === "br" ? br() : eu();
}
