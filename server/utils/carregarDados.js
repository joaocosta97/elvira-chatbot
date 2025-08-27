import fs from 'fs';
import path from 'path';

export function carregarDados(diretorio) {
  const ficheiros = fs.readdirSync(diretorio);
  const dados = {};

  ficheiros.forEach(ficheiro => {
    const nome = path.basename(ficheiro, path.extname(ficheiro));
    const conteudo = fs.readFileSync(path.join(diretorio, ficheiro), 'utf-8');
    dados[nome] = conteudo;

    // Extração dos exames válidos
    if (nome === 'hal_exames_analises') {
      const exames = extrairExames(conteudo);
      const publicPath = path.resolve('public', 'dados');
      if (!fs.existsSync(publicPath)) fs.mkdirSync(publicPath, { recursive: true });

      fs.writeFileSync(path.join(publicPath, 'exames.json'), JSON.stringify(exames, null, 2), 'utf-8');
      console.log(`✅ Lista de exames extraída para public/dados/exames.json (${exames.length} exames)`);
    }
  });

  return dados;
}

function extrairExames(conteudo) {
  const linhas = conteudo.split('\n');
  const exames = [];

  for (const linha of linhas) {
    const limpa = linha.trim();
    if (limpa.startsWith('-')) {
      const exame = limpa.replace(/^-\s*/, '').trim();
      if (exame.length > 0) exames.push(exame);
    }
  }

  return exames;
}
