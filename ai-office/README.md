# 🏢 AI Office

Um **escritório virtual 3D interativo** no browser, estilo jogo, onde agentes de IA aparecem como avatares trabalhando em mesas. Caminhe pelo escritório e veja cada agente executando tarefas em tempo real.

![AI Office Preview](https://via.placeholder.com/900x450/1a1c22/4a9eff?text=AI+Office+%E2%80%94+Escrit%C3%B3rio+Virtual+3D)

---

## Funcionalidades

- **Escritório 3D completo** com mesas, cadeiras, plantas, janelas e iluminação
- **4 agentes de IA** com avatares low-poly coloridos e animados
- **Balões de fala** mostrando tarefas em tempo real
- **Nome e badge flutuantes** acima de cada avatar
- **Controles FPS** — WASD + mouse (Pointer Lock)
- **Painel lateral** com log de atividades e status dos agentes
- **Modal para adicionar novos agentes** em mesas disponíveis
- **Responsivo** — funciona no mobile com joystick virtual

---

## Como rodar

### Opção 1 — Python (recomendado)

```bash
# Dentro da pasta ai-office/
python3 -m http.server 8080
```

Acesse: [http://localhost:8080](http://localhost:8080)

### Opção 2 — Node.js (npx serve)

```bash
npx serve .
```

### Opção 3 — VS Code Live Server

Instale a extensão **Live Server** e clique em "Go Live".

> **Importante:** O projeto usa ES Modules (`type="module"`) e importmap, então precisa ser servido via HTTP. Não funciona abrindo o `index.html` diretamente (file:///).

---

## Controles

| Tecla / Ação         | Função                              |
|----------------------|-------------------------------------|
| `Clique` no canvas   | Ativa o controle de câmera (Pointer Lock) |
| `W A S D`            | Mover para frente/trás/esquerda/direita |
| `Setas direcionais`  | Mover (alternativa ao WASD)        |
| `Mouse`              | Olhar em volta                     |
| `Shift + WASD`       | Correr (velocidade 2x)             |
| `ESC`                | Soltar o mouse / sair do modo câmera |
| `Clique num avatar`  | Ver detalhes no painel lateral     |
| Mobile: joystick     | Mover o personagem                  |
| Mobile: swipe direito| Girar a câmera                     |

---

## Estrutura do projeto

```
ai-office/
├── index.html          # HTML principal, importmap Three.js
├── style.css           # Estilos: HUD, painel, modal, responsividade
├── js/
│   ├── main.js         # Inicialização: cena, câmera, luz, loop
│   ├── office.js       # Construção do escritório 3D
│   ├── avatar.js       # Classe Avatar (corpo, animação, fala, nametag)
│   ├── agents.js       # Configs dos 4 agentes + mensagens por função
│   ├── controls.js     # Controles WASD + mouse FPS + mobile
│   └── ui.js           # Painel lateral, log, modal, detalhes
└── README.md
```

---

## Os 4 agentes iniciais

| Avatar | Nome  | Função           | Cor     |
|--------|-------|------------------|---------|
| 🔍     | Dante | Prospecção       | Azul    |
| 🎯     | Luna  | Qualificação CRM | Verde   |
| 💰     | Rex   | Financeiro       | Dourado |
| 📱     | Mia   | Marketing        | Rosa    |

---

## Como adicionar novos agentes

### Via interface (recomendado)

1. Clique no botão **"+ Adicionar Agente"** no canto superior direito
2. Preencha: nome, função e cor do avatar
3. Clique em **"Criar"** — o avatar aparece numa mesa vazia

### Via código

Abra `js/agents.js` e adicione uma nova entrada no array `AGENT_CONFIGS`:

```js
{
  name:  'Alex',
  role:  'Suporte',
  emoji: '🎧',
  color: 0xaa44ff,   // Roxo — qualquer cor hex
  messages: [
    'Respondendo ticket #4521...',
    'Resolvendo problema do cliente...',
    'Escalando para nível 2...',
    'Fechando chamado com sucesso!',
  ],
},
```

O novo avatar ocupará automaticamente a próxima mesa disponível no escritório.

---

## Personalização

### Alterar velocidade/tamanho do escritório

Em `js/controls.js`:
```js
const MOVE_SPEED = 6.0;    // velocidade de caminhada
const SPRINT_MULT = 2.0;   // multiplicador de sprint
```

Em `js/office.js`:
```js
const ROOM_W = 32;   // largura (metros)
const ROOM_D = 28;   // profundidade
const ROOM_H = 4.5;  // altura do teto
```

### Alterar intervalo das tarefas

Em `js/avatar.js`:
```js
const TASK_MIN_MS = 5000;   // mínimo 5 segundos
const TASK_MAX_MS = 15000;  // máximo 15 segundos
```

---

## Stack tecnológica

| Biblioteca     | Versão  | Uso                            |
|----------------|---------|--------------------------------|
| [Three.js](https://threejs.org) | 0.160.0 | Renderização 3D via WebGL |
| HTML/CSS/JS    | nativo  | Interface e lógica             |

> Sem frameworks, sem bundlers, sem dependências npm. Tudo via CDN com ES Modules nativos.

---

## Compatibilidade

- Chrome 90+ ✅
- Firefox 90+ ✅
- Safari 15+ ✅
- Edge 90+ ✅
- Mobile (iOS/Android) ✅ com joystick virtual

---

## Licença

MIT — use, modifique e distribua livremente.
