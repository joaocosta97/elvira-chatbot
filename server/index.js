import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path, { resolve } from "path";
import { fileURLToPath } from "url";
import { carregarDados } from "./utils/carregarDados.js";
import { gerarResposta } from "./utils/gerarResposta.js";
import { detetarIntencao } from "./utils/detetarIntencao.js";
import admin from "firebase-admin";
import crypto from "crypto";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔐 Carregar variáveis de ambiente
dotenv.config({ path: resolve(__dirname, ".env") });

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());

// Guardar rawBody para validação da assinatura do WhatsApp
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ✅ Construir credenciais Firebase com variáveis separadas
const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID || "CHAVE_ID_OPCIONAL",
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID || "CLIENT_ID_OPCIONAL",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: `https://www.googleapis.com/robot/v1/metadata/x509/${encodeURIComponent(
    process.env.FIREBASE_CLIENT_EMAIL
  )}`,
  universe_domain: "googleapis.com",
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
const db = admin.firestore();

const dados = carregarDados(path.join(__dirname, "dados"));

/* -------------------- WHATSAPP CLOUD API -------------------- */

// GET /webhook → validação inicial com Meta
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// Validar assinatura do POST
function isValidSignature(req) {
  const signature = req.get("x-hub-signature-256") || "";
  const hmac = crypto.createHmac("sha256", process.env.APP_SECRET);
  hmac.update(req.rawBody);
  const expected = "sha256=" + hmac.digest("hex");
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

// Enviar mensagem para o WhatsApp
async function enviarMensagemWhatsApp(to, body) {
  const url = `https://graph.facebook.com/v20.0/${process.env.PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    },
    {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    }
  );
}

// POST /webhook → receber mensagens do WhatsApp
app.post("/webhook", async (req, res) => {
  if (!isValidSignature(req)) return res.sendStatus(403);

  const entry = req.body?.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;
  const messages = value?.messages;

  if (messages && messages.length > 0) {
    const msg = messages[0];
    const waId = msg.from; // nº de WhatsApp do utilizador
    let texto = "";

    if (msg.type === "text") texto = msg.text?.body || "";
    if (msg.type === "interactive") {
      const i = msg.interactive;
      if (i?.type === "button_reply") texto = i.button_reply?.title || "";
      if (i?.type === "list_reply") texto = i.list_reply?.title || "";
    }

    let respostaFinal = "Recebido: " + texto;

    try {
      // Usar a tua lógica atual (detetar intenção + gerar resposta)
      const { intencao, confianca } = detetarIntencao(texto);

      if (confianca >= 0.6) {
        switch (intencao) {
          case "falar_com_assistente":
            respostaFinal =
              "Pode contactar a nossa equipa ligando para o número +351 253 639 035.";
            break;
          case "confirmar_marcacao":
            respostaFinal =
              "Certo. Pode indicar o nome do exame ou do médico para avançarmos com a marcação?";
            break;
          case "marcar_exame":
            respostaFinal =
              "Pretende marcar um exame? Pode indicar qual o exame que deseja?";
            break;
          case "marcar_consulta":
            respostaFinal =
              "Claro. Qual a especialidade ou médico que deseja consultar?";
            break;
          case "perguntar_medico":
            respostaFinal =
              "Pode indicar a especialidade para verificar os médicos disponíveis?";
            break;
          case "perguntar_protocolo":
            respostaFinal =
              "Temos acordo com diversas entidades. Qual deseja confirmar?";
            break;
          case "perguntar_exame":
            respostaFinal =
              "Por favor, indique o nome do exame para verificar se o realizamos.";
            break;
        }
      } else {
        const respostaIA = await gerarResposta(texto, dados, {
          canal: "whatsapp",
        });
        respostaFinal = respostaIA;
      }

      await enviarMensagemWhatsApp(waId, respostaFinal);
    } catch (err) {
      console.error("Erro no processamento WhatsApp:", err.message);
      await enviarMensagemWhatsApp(
        waId,
        "Erro interno. Tente novamente mais tarde."
      );
    }
  }

  return res.sendStatus(200);
});

/* -------------------- API SITE / DASHBOARD -------------------- */

app.post("/mensagem", async (req, res) => {
  const { mensagem, historico, contexto } = req.body;

  try {
    const { intencao, confianca } = detetarIntencao(mensagem);

    if (confianca >= 0.6) {
      switch (intencao) {
        case "falar_com_assistente":
          return res.json({
            resposta:
              "Pode contactar a nossa equipa ligando para o número +351 253 639 035.",
          });
        case "confirmar_marcacao":
          return res.json({
            resposta:
              "Certo. Pode indicar o nome do exame ou do médico para avançarmos com a marcação?",
          });
        case "marcar_exame":
          return res.json({
            resposta: "Pretende marcar um exame? Pode indicar qual?",
          });
        case "marcar_consulta":
          return res.json({
            resposta:
              "Claro. Qual a especialidade ou médico que deseja consultar?",
          });
        case "perguntar_medico":
          return res.json({
            resposta:
              "Pode indicar a especialidade para verificar os médicos disponíveis?",
          });
        case "perguntar_protocolo":
          return res.json({
            resposta:
              "Temos acordo com diversas entidades. Qual deseja confirmar?",
          });
        case "perguntar_exame":
          return res.json({
            resposta:
              "Por favor, indique o nome do exame para verificar se o realizamos.",
          });
      }
    }

    const resposta = await gerarResposta(mensagem, dados, contexto);
    res.json({ resposta });
  } catch (err) {
    console.error("Erro ao gerar resposta:", err.message);
    res
      .status(500)
      .json({ resposta: "Erro interno. Tente novamente mais tarde." });
  }
});

app.post("/marcacao", async (req, res) => {
  const dados = req.body;
  const dataHora = new Date();

  try {
    await db.collection("marcacoes").add({
      ...dados,
      estado: "pendente",
      dataPedido: admin.firestore.Timestamp.fromDate(dataHora),
    });

    console.log(
      `✅ Nova marcação (${dados.tipo || "desconhecido"}) guardada no Firestore:`,
      dados
    );
    res.status(200).json({
      resposta: "Obrigado! Será contactado para confirmar a sua marcação.",
    });
  } catch (err) {
    console.error("❌ Erro ao guardar marcação:", err.message);
    res.status(500).json({ resposta: "Erro ao guardar a marcação." });
  }
});

/* -------------------- SITE -------------------- */

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`Servidor Elvira ativo na porta ${port}`);
});
