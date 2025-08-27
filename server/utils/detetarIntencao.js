import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Caminho absoluto baseado no local atual do ficheiro
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Caminhos corrigidos para funcionar no Railway
const examesPath = resolve(__dirname, '../public/dados/exames.json');
const medicosPath = resolve(__dirname, '../public/dados/medicos.json');

const exames = JSON.parse(fs.readFileSync(examesPath, 'utf-8'));
const medicos = JSON.parse(fs.readFileSync(medicosPath, 'utf-8'));

const especialidades = [
  'angiologia e cirurgia vascular', 'cardiologia', 'cirurgia geral', 'cirurgia plástica, reconstrutiva e estética',
  'dermatologia', 'endocrinologia', 'medicina física e de reabilitação', 'fisiatria', 'fisioterapia',
  'gastrenterologia', 'ginecologia e obstetrícia', 'imunoalergologia', 'medicina dentária', 'medicina interna',
  'oftalmologia', 'ortopedia', 'otorrinolaringologia', 'pediatria', 'pneumologia', 'alergologia respiratória',
  'psicologia', 'psiquiatria', 'reumatologia', 'urologia', 'nutrição', 'podologia', 'terapia da fala'
];

const protocolos = [
  'adse', 'multicare', 'médis', 'advancecare', 'sams',
  'seguro fidelidade', 'seguro tranquilidade', 'sigic'
];

const sinonimosExames = {
  ecg: 'eletrocardiograma',
  eletrocardiograma: 'eletrocardiograma',
  ecocardiograma: 'ecocardiograma',
  mapa: 'mapa',
  eda: 'endoscopia digestiva alta eda',
  rx: 'raio x',
  raiox: 'raio x',
};

const sinonimosEspecialidades = {
  cirurgia: 'cirurgia geral',
  fisioterapia: 'medicina física e de reabilitação',
  fisiatria: 'medicina física e de reabilitação',
  ginecologia: 'ginecologia e obstetrícia',
  podologia: 'podologia',
  terapia: 'terapia da fala'
};

const normalizar = str =>
  str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/gi, '')
    .trim();

function expandirSinonimos(texto) {
  let resultado = texto;
  for (const [sinonimo, destino] of Object.entries(sinonimosExames)) {
    const regex = new RegExp(`\\b${sinonimo}\\b`, 'gi');
    resultado = resultado.replace(regex, destino);
  }
  return resultado;
}

function expandirSinonimosEspecialidades(texto) {
  let resultado = texto;
  for (const [sinonimo, destino] of Object.entries(sinonimosEspecialidades)) {
    const regex = new RegExp(`\\b${sinonimo}\\b`, 'gi');
    resultado = resultado.replace(regex, destino);
  }
  return resultado;
}

const nomesMedicosSimplificados = medicos.map(m => ({
  original: m.nome,
  simplificado: normalizar(m.nome)
}));

export function detetarIntencao(texto) {
  const exemplos = [
    { intencao: 'marcar_exame', exemplo: 'quero marcar um exame de sangue' },
    { intencao: 'marcar_consulta', exemplo: 'preciso de uma consulta de cardiologia' },
    { intencao: 'perguntar_medico', exemplo: 'quem são os médicos de fisioterapia' },
    { intencao: 'perguntar_exame', exemplo: 'fazem colonoscopias' },
    { intencao: 'perguntar_protocolo', exemplo: 'aceitam ADSE ou Multicare' },
    { intencao: 'confirmar_marcacao', exemplo: 'sim quero marcar' },
    { intencao: 'falar_com_assistente', exemplo: 'quero falar com um assistente humano' }
  ];

  const textoExpandido = expandirSinonimosEspecialidades(expandirSinonimos(texto));
  const textoNorm = normalizar(textoExpandido);

  const contemExame = exames.find(exame => textoNorm.includes(normalizar(exame)));

  const contemMedico = nomesMedicosSimplificados.find(m => {
    const partes = m.simplificado.split(' ');
    return partes.every(p => textoNorm.includes(p));
  });

  const contemEspecialidade = especialidades.find(espec =>
    textoNorm.includes(normalizar(espec)));

  const contemProtocolo = protocolos.find(p =>
    textoNorm.includes(normalizar(p)));

  if (contemExame && /marcar|fazer|preciso|queria|gostava/i.test(textoNorm)) {
    return { intencao: 'marcar_exame', confianca: 0.99 };
  }

  if (contemExame) {
    return { intencao: 'perguntar_exame', confianca: 0.95 };
  }

  if (contemMedico && /marcar|consulta|ver|quero/i.test(textoNorm)) {
    return { intencao: 'marcar_consulta', confianca: 0.98 };
  }

  if (contemEspecialidade && /marcar|consulta|ver|quero/i.test(textoNorm)) {
    return { intencao: 'marcar_consulta', confianca: 0.95 };
  }

  if (contemEspecialidade && /quem|quais|médicos|medicos|doutores|professores/i.test(textoNorm)) {
    return { intencao: 'perguntar_medico', confianca: 0.92 };
  }

  if (contemProtocolo) {
    return { intencao: 'perguntar_protocolo', confianca: 0.97 };
  }

  if (/^sim\b|pode ser|quero|quero sim|confirmo/i.test(textoNorm)) {
    return { intencao: 'confirmar_marcacao', confianca: 0.9 };
  }

  if (/falar com.*assistente|humano|pessoa|operador/i.test(textoNorm)) {
    return { intencao: 'falar_com_assistente', confianca: 0.99 };
  }

  // Fallback leve baseado em similaridade com exemplos
  let melhor = null;
  let maiorSim = 0;

  for (const { intencao, exemplo } of exemplos) {
    const exemploNorm = normalizar(exemplo);
    const tokensFrase = textoNorm.split(' ');
    const tokensExemplo = exemploNorm.split(' ');
    const intersecao = tokensFrase.filter(p => tokensExemplo.includes(p)).length;
    const total = new Set([...tokensFrase, ...tokensExemplo]).size;
    const sim = intersecao / total;

    if (sim > maiorSim) {
      maiorSim = sim;
      melhor = intencao;
    }
  }

  return { intencao: melhor, confianca: maiorSim };
}
