import OpenAI from "openai";
import dotenv from "dotenv";

// Carregar variáveis ambiente no modo local
if (process.env.NODE_ENV !== "production") {
  dotenv.config();
}

let openai = null;

if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
  console.error(
    "❌ OPENAI_API_KEY não está definida. Verifica o ficheiro .env!"
  );
  throw new Error("OPENAI_API_KEY não definida.");
}

const systemPrompt = `
O teu nome é Elvira e és a assistente virtual do Hospital António Lopes.

Regras de comportamento:
- Responde sempre em português europeu, com um tom profissional, claro e direto.
- Usa frases curtas, sem floreados ou linguagem informal.
- Nunca inventes. Responde apenas com base nos dados concretos fornecidos no histórico da conversa ou no contexto enviado.
- Se não tiveres informação suficiente sobre o tema mencionado (ex: exame, especialidade, protocolo ou médico), responde apenas:
"Pedimos desculpa, mas não realizamos esse tipo de consultas ou não temos essa informação. Deseja falar com um assistente?"
- Nunca afirmes que um serviço está disponível se esse serviço (especialidade, protocolo ou exame) não estiver no contexto.
- Quando te perguntarem algo genérico como “quero marcar uma consulta” ou “quero fazer um exame”, inicia o fluxo de marcação pedindo o nome do médico, especialidade ou exame específico.
- Se te pedirem contacto humano, responde com: "Pode ligar diretamente para a nossa equipa através do número +351 253 639 035."
- Se te perguntarem sobre se o Hospital António Lopes tem serviço de urgência, primeiro responde: "Não, o Hospital António Lopes não possui serviço de urgência" e depois informa o utilizador sobre o serviço de Consulta Aberta 24h.

Formatação:
- Quando enumerares médicos ou serviços, usa uma lista simples, sem repetições.
- Nunca tentes agradar ou preencher lacunas com suposições.

Objetivo:
- A tua missão é prestar apoio direto e seguro aos utentes do Hospital António Lopes, com base em dados concretos. Não tentes ser criativa — sê fiável.
`;

/**
 *
 * @param {string} pergunta Texto do utilizador
 * @param {Object} dados Objeto com {titulo1: texto1, titulo2: texto2, ...}
 * @param {Object} contexto Objeto com chaves opcionais: medico, especialidade, exame, protocolo
 * @returns {Promise<string>} resposta da IA
 */
export async function gerarResposta(pergunta, dados, contexto = {}) {
  const partesContexto = [];

  if (contexto.medico)
    partesContexto.push(`Último médico mencionado: ${contexto.medico}`);
  if (contexto.especialidade)
    partesContexto.push(
      `Última especialidade mencionada: ${contexto.especialidade}`
    );
  if (contexto.exame)
    partesContexto.push(`Último exame mencionado: ${contexto.exame}`);
  if (contexto.protocolo)
    partesContexto.push(`Último protocolo mencionado: ${contexto.protocolo}`);

  const contextoUtilizador =
    partesContexto.length > 0
      ? `\n\n🧠 Contexto recente da conversa:\n${partesContexto.join("\n")}`
      : "";

  const contextoDados = Object.entries(dados)
    .map(
      ([titulo, conteudo]) =>
        `### ${titulo.replace(/_/g, " ").toUpperCase()}\n${conteudo}`
    )
    .join("\n\n");

  // Verificação manual: se a pergunta indicar intenção mas não há contexto
  const perguntaLimpa = pergunta
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const temIntencaoVaga =
    /\b(marcar|consulta|exame|agendar|preciso|queria|quero|fazer)\b/.test(
      perguntaLimpa
    );

  if (
    temIntencaoVaga &&
    !contexto.medico &&
    !contexto.especialidade &&
    !contexto.exame
  ) {
    return "Claro. Pode indicar o nome do médico, da especialidade ou do exame que pretende marcar?";
  }

  const completion = await openai.chat.completions.create({
    model: "gpt-3.5-turbo-1106",
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Pergunta: ${pergunta}${contextoUtilizador}\n\nInformação disponível:\n${contextoDados}`,
      },
    ],
    temperature: 0.5,
    max_tokens: 300,
  });

  return completion.choices[0].message.content.trim();
}
