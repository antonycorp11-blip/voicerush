# Do Zero ao Palco — Music School Tycoon

Jogo de gerenciamento (tycoon) de escola de música em pixel art, com visão top-down inclinada (3/4).
A história é inspirada na trajetória real de um professor que abriu a própria escola do zero.

## A história (capítulos)

1. **O Estúdio**: você é funcionário do Estúdio Som Maior. Dá aulas (minigames musicais) e faz a parte
   administrativa (papelada e caixa). Depois de alguns dias, o dono corta suas horas.
2. **A Salinha do Bairro**: você aluga uma sala largada no seu bairro, com seus próprios instrumentos.
   Atende interessados, dá aulas, espalha panfletos e grava vídeos pro YouTube.
   Meta: 8 alunos e 1.000 visualizações.
3. **A Escola**: um investidor viu seu vídeo e entra com R$ 25.000. O prédio inteiro vira sua escola,
   mas **todo sábado** ele confere o **caixa** e a **previsão de lucro**. Se a confiança dele zerar, fim de jogo.
   O objetivo final é **abrir a Filial**.

## Mecânicas

- **Aulas = minigames musicais**, jogáveis por quem não entende de música:
  Ritmo Certo, Siga a Melodia, Afinação, Monte o Acorde, Nota Intrusa e Papelada (administrativo).
  Se você não clicar a tempo, a aula acontece "no automático", com qualidade menor.
- **Interessados (❓)** chegam pela rua. No atendimento você vê a chance de matrícula, oferece aula individual ou
  turma, dá desconto ou aula experimental. Sem professor ou sala com o instrumento, vão para a lista de espera.
- **Demanda clara**: o painel 📊 mostra a procura por instrumento e por que você está perdendo alunos
  (falta professor, falta sala/equipamento, agenda lotada).
- **Professores em cards**: instrumentos, estrelas, custo por aula, agenda, moral e traços
  (Pontual, Faltoso, Virtuoso, Carismático…). Treine, dê aumento, faça reuniões de professores.
- **Construção e transformação visual**: alugue espaços, construa salas de aula, recepção, sala de ensaio,
  café & lounge, auditório e estúdio. Reforme o ambiente (abandonado → pintado → aconchegante → premium)
  e compre instrumentos melhores (básico → bom → pro), tudo visível no mapa.
- **Estratégia**: volume (turmas baratas, muitos alunos) ou premium (poucos alunos, ticket alto, aulas excelentes).
  Preço alto aumenta a expectativa do aluno.
- **Situações**: professor falta (você assume as aulas dele), pedidos de desconto, inadimplência, renovação,
  propostas de colégios e empresas, aluno prodígio, vizinho reclamando da bateria… A secretária resolve
  as administrativas por você.
- **Escolas rivais** com estratégias diferentes disputam o mercado, fazem promoções e tentam levar seus professores.
- **Árvore de habilidades musical** (Pedagogia, Ambiente, Marketing, Gestão, Palco, Expansão) com Notas Musicais
  ganhas a cada nível de reputação.

## Rodando

```bash
npm install
npm run dev      # servidor de desenvolvimento
npm run build    # build de produção em dist/
```

Controles: clique no mapa para interagir, arraste para mover a câmera, roda do mouse para zoom.
Espaço pausa, teclas 1/2/3 mudam a velocidade.

## Estrutura

- `src/art/` — pixel art procedural (personagens, instrumentos, móveis, contorno automático)
- `src/game/` — simulação (`game.ts`), estado e save (`state.ts`), cena/renderização (`scene.ts`), eventos
- `src/minigames/` — os minigames de aula
- `src/ui/` — HUD, painéis, árvore de habilidades, diálogos
- `src/data/` — instrumentos, salas, campanhas, habilidades e rivais
- `src/audio.ts` — sintetizador WebAudio (notas, bateria, trilha lo-fi)

Toda a arte e o áudio são gerados por código: não há arquivos de imagem ou som externos.

## Deploy (Cloudflare Workers)

O `wrangler.jsonc` publica a pasta `dist/` como site estático no worker `musicash`.
O build usa `npm run build` e o deploy `npx wrangler deploy`.
