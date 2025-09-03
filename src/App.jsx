// FILE: /package.json
{
  "name": "beslisboom-quiz",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.41",
    "tailwindcss": "^3.4.10",
    "vite": "^5.4.6"
  }
}

// FILE: /.replit
run = "npm run dev -- --host 0.0.0.0 --port 3000"
language = "nodejs"

// FILE: /index.html
<!doctype html>
<html lang="nl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Beslisboom → Quiz</title>
  </head>
  <body class="min-h-screen bg-gray-50">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>

// FILE: /postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};

// FILE: /tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};

// FILE: /src/main.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// FILE: /src/index.css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* kleine helpers */
:root { color-scheme: light; }

// FILE: /src/App.jsx
import React from 'react';

/*
PSEUDOCODE — PLAN VAN AANPAK (BESLISBOOM → QUIZ)
1) Doelen
   1.1 Responsive, toegankelijke React webapp (desktop & mobiel) die een beslisboom toont als klikbare quiz.
   1.2 Data ↔ UI ontkoppeld: JSON‑dataset (schema hieronder).
   1.3 Import via bestand/URL, voortgang in localStorage, deeplinks via hash.
   1.4 Breadcrumbs, terug/herstart, deelbare resultaten, validatie & TXT/CSV‑export.
   1.5 Kant‑en‑klare system prompt (GPT‑instructie) voor consistente code/JSON.

2) Dataschema
   TreeNode: { id, title, description?, type: 'question'|'outcome'|'link', options?, info? }
   Option:   { label, next }
   Dataset:  { version, rootId, nodes: Record<string, TreeNode> }

3) Logica
   currentId ← hash || localStorage || dataset.rootId
   answer(next) → push history + set currentId + persist + update hash
   back/reset/share/validate/export routes

4) UI/UX
   Mobile‑first (Tailwind), grote klikdoelen, aria labels, focus states.

5) Validatie
   Schema‑check (root/targets), extra check (bereikbaarheid, cycli, dead‑ends), TXT/CSV‑rapport met alle routes.
— EINDE PSEUDOCODE —
*/

/***************************
 * GPT‑INSTRUCTIEVENSTER   *
 ***************************/
const SYSTEM_PROMPT_FOR_YOUR_GPT = `
You are a senior frontend engineer. Your sole job is to help the user build and evolve a responsive decision-tree quiz website that runs on Replit. Follow these rules strictly:

1) Technology & Style
- Framework: React (Vite), plain JSX, TailwindCSS. No runtime UI lib assumptions (avoid shadcn imports unless the project already contains them).
- Code quality: readable, accessible (ARIA), mobile-first, minimal dependencies, KISS.
- Deliver full, runnable code. Avoid placeholders. Provide a single consolidated file when asked unless user requests multi-file.

2) Data Model (must follow exactly)
- Dataset JSON shape:
  {
    "version": 1,
    "rootId": "start",
    "nodes": {
      "<id>": {
        "id": "<id>",
        "title": "<short question or outcome>",
        "description": "<optional longer text>",
        "type": "question" | "outcome" | "link",
        "options": [ { "label": "<answer>", "next": "<nodeId>" } ],
        "info": {
          "badges": ["<e.g. Deelkaart 1 • #12>"] ,
          "links": [ {"label": "RVO – Subsidie praktijkleren", "href": "https://..."} ],
          "notes": "<short hints or legal notes>"
        }
      }
    }
  }
- Every option.next must reference an existing node id. rootId must exist.

3) Converting the user's decision maps ("Deelkaarten")
- Treat each numbered instrument/step as a node. Questions → type:'question'; terminal instruments/arrangements → type:'outcome' or 'link'.
- Preserve original numbering (e.g., "Stap 3", "Instrument 31") within title or info.badges for traceability.
- Keep texts concise, avoid legal drafting; add source links when available.

4) Output Policy
- When asked for code: output ONLY a single code block (no extra prose), containing complete React component(s) or dataset JSON as requested.
- When asked to add or modify nodes: output ONLY the JSON diff or full JSON as requested.
- When asked to validate: perform checks and list concrete fixes.

5) Acceptance Checklist (before replying)
- [ ] Compiles on Replit (Vite React).
- [ ] All links & node references are valid.
- [ ] Keyboard navigation works.
- [ ] Mobile layout usable with thumb targets (>=44px).
- [ ] No private APIs, no background tasks.

6) Helpful Shortcuts
- Provide importable JSON for the "Dataset Loader" in the user's app (file or URL). Keep IDs kebab-case and unique.
- For large maps, deliver JSON in chunks (<=300 lines) when requested.
`;

/** @typedef {{label: string, next: string}} Option */
/** @typedef {{
 *  id: string,
 *  title: string,
 *  description?: string,
 *  type: 'question'|'outcome'|'link',
 *  options?: Option[],
 *  info?: { badges?: string[], links?: {label:string, href:string}[], notes?: string }
 * }} TreeNode */
/** @typedef {{ version: number, rootId: string, nodes: Record<string, TreeNode> }} Dataset */

// — Voorbeeld‑dataset (kleine subset) —
const SAMPLE_DATASET /** @type {Dataset} */ = {
  version: 1,
  rootId: 'start',
  nodes: {
    start: {
      id: 'start',
      title: 'Begeleiding naar werk?',
      description: 'Wil de cliënt begeleiding bij het vinden of behouden van werk? (Stap 1)',
      type: 'question',
      options: [
        { label: 'Ja', next: 'situatie' },
        { label: 'Nee', next: 'einde-geen-verdere-stappen' }
      ],
      info: { badges: ['Deelkaart 1 • Stap 1'] }
    },
    'einde-geen-verdere-stappen': {
      id: 'einde-geen-verdere-stappen',
      title: 'Einde — geen verdere stappen',
      description: 'Er is geen traject nodig op dit moment.',
      type: 'outcome',
      info: { badges: ['Deelkaart 1'], notes: 'Kies “Herstart” om opnieuw te beginnen.' }
    },

    situatie: {
      id: 'situatie',
      title: 'Wat is van toepassing?',
      description: 'Kies de huidige status van de cliënt. (Stap 2)',
      type: 'question',
      options: [
        { label: 'Cliënt heeft werk', next: 'werk-ondersteuning-werkgever' },
        { label: 'Cliënt heeft uitkering', next: 'uitkering-ondersteuning' },
        { label: 'Geen werk en geen uitkering', next: 'geen-werk-gemeente' },
        { label: 'Alternatief traject (lokaal)', next: 'alternatief-traject' }
      ],
      info: { badges: ['Deelkaart 1 • Stap 2'] }
    },

    'werk-ondersteuning-werkgever': {
      id: 'werk-ondersteuning-werkgever',
      title: 'Ondersteuning door de werkgever',
      description: 'Werkgever kan begeleiden of netwerk inzetten. Meer intensieve ondersteuning nodig?',
      type: 'question',
      options: [
        { label: 'Ja → Re-integratietraject via werkgever', next: 'reint-werkgever' },
        { label: 'Nee → Route eindigt', next: 'einde-route-werkgever' }
      ],
      info: { badges: ['#1 • Deelkaart 1'] }
    },
    'reint-werkgever': {
      id: 'reint-werkgever',
      title: 'Re-integratietraject via werkgever',
      description: 'Werkgever schakelt re-integratiebedrijf in.',
      type: 'outcome',
      info: { badges: ['#2 • Deelkaart 1'], notes: 'Vervolg kan leiden naar Deelkaart 2 of 3, afhankelijk van keuzes.' }
    },
    'einde-route-werkgever': {
      id: 'einde-route-werkgever',
      title: 'Einde van dit pad',
      description: 'Geen traject via werkgever. Herstart of kies een ander pad.',
      type: 'outcome',
      info: { badges: ['Deelkaart 1'] }
    },

    'uitkering-ondersteuning': {
      id: 'uitkering-ondersteuning',
      title: 'Ondersteuning door UWV of gemeente',
      description: 'Meer intensieve ondersteuning nodig?',
      type: 'question',
      options: [
        { label: 'UWV → Re-integratietraject', next: 'reint-uwv' },
        { label: 'Gemeente → Re-integratietraject', next: 'reint-gemeente' },
        { label: 'Nee', next: 'einde-geen-intensief' }
      ],
      info: { badges: ['#3 • Deelkaart 1'] }
    },
    'reint-uwv': {
      id: 'reint-uwv',
      title: 'Re-integratietraject via UWV',
      description: 'UWV koopt trajecten in bij een re-integratiebedrijf.',
      type: 'outcome',
      info: { badges: ['#4 • Deelkaart 1'], links: [{label:'UWV — Re-integratie', href:'https://www.uwv.nl/particulieren/werken-met-een-beperking/re-integratie/index.aspx'}] }
    },
    'reint-gemeente': {
      id: 'reint-gemeente',
      title: 'Re-integratietraject via gemeente',
      description: 'Gemeente koopt trajecten in of zet mobiliteitsteam in.',
      type: 'outcome',
      info: { badges: ['#5 • Deelkaart 1'], links: [{label:'Rijksoverheid — Participatiewet', href:'https://www.rijksoverheid.nl/onderwerpen/participatiewet'}] }
    },
    'einde-geen-intensief': {
      id: 'einde-geen-intensief',
      title: 'Einde — geen intensieve ondersteuning',
      description: 'Kies herstart om opnieuw te beginnen.',
      type: 'outcome',
      info: { badges: ['Deelkaart 1'] }
    },

    'geen-werk-gemeente': {
      id: 'geen-werk-gemeente',
      title: 'Ondersteuning door gemeente (geen werk/uitkering)',
      description: 'Meer intensieve begeleiding nodig?',
      type: 'question',
      options: [
        { label: 'Ja → Re-integratietraject via gemeente', next: 'reint-gemeente' },
        { label: 'Nee', next: 'einde-geen-traject' }
      ],
      info: { badges: ['#7/#8 • Deelkaart 1'] }
    },
    'einde-geen-traject': {
      id: 'einde-geen-traject',
      title: 'Einde — geen traject',
      description: 'Herstart om opnieuw te kiezen.',
      type: 'outcome'
    },

    'alternatief-traject': {
      id: 'alternatief-traject',
      title: 'Alternatief traject (lokaal)',
      description: 'Regionaal mobiliteitsteam, fondsen, leerwerkloketten. Gaat door naar opleiding & werkervaring.',
      type: 'link',
      info: { badges: ['#6 • Deelkaart 1'], links: [{label:'Leerwerkloket', href:'https://www.leerwerkloket.nl/'}] }
    }
  }
};

// ——— Deelkaarten 1 & 4 (SAMENGEV. DATASET) ———
const DATASET_DEELKAARTEN_1_4 /** @type {Dataset} */ = {
  version: 1,
  rootId: 'hub',
  nodes: {
    hub: {
      id: 'hub',
      title: 'Kies deelkaart',
      description: 'Volg Deelkaart 1 (Trajecten/opleiding/werkervaring) of Deelkaart 4 (Start eigen bedrijf).',
      type: 'question',
      options: [
        { label: 'Deelkaart 1 – Arbeidsmarktkansen vergroten', next: 'd1-start' },
        { label: 'Deelkaart 4 – Hulp bij start eigen bedrijf', next: 'd4-start' }
      ]
    },

    // — Deelkaart 1: kernpaden (nrs. 9–24 + referenties)
    'd1-start': {
      id: 'd1-start',
      title: 'Begeleiding naar werk?',
      description: 'Start Deelkaart 1.',
      type: 'question',
      options: [
        { label: 'Ja', next: 'd1-situatie' },
        { label: 'Nee', next: 'd1-end' }
      ],
      info: { badges: ['Deelkaart 1'] }
    },
    'd1-end': { id: 'd1-end', title: 'Einde Deelkaart 1', type: 'outcome' },

    'd1-situatie': {
      id: 'd1-situatie',
      title: 'Wat is voor jouw cliënt van toepassing?',
      type: 'question',
      options: [
        { label: 'Cliënt heeft werk', next: 'd1-werkgever-route' },
        { label: 'Cliënt heeft uitkering', next: 'd1-uitkering-route' },
        { label: 'Cliënt heeft geen werk of uitkering', next: 'd1-gemeente-route' },
        { label: 'Alternatief traject (lokaal)', next: 'd1-alternatief' },
        { label: 'Extra opleiding?', next: 'd1-extra-opleiding' },
        { label: 'Onbetaald werkervaring opdoen?', next: 'd1-onbetaald' }
      ]
    },

    // Opleiding
    'd1-extra-opleiding': {
      id: 'd1-extra-opleiding',
      title: 'Wat heeft jouw cliënt nodig? (opleiding)',
      type: 'question',
      options: [
        { label: 'Hulp bij studiekeuze', next: 'd1-out-9' },
        { label: 'Regulier onderwijs (financiering)', next: 'd1-onderwijs' },
        { label: 'Overige opleiding/scholing', next: 'd1-overige-opleiding' }
      ],
      info: { badges: ['DK1 • opleiding'] }
    },
    'd1-onderwijs': {
      id: 'd1-onderwijs',
      title: 'Regulier onderwijs – wat past?',
      type: 'question',
      options: [
        { label: '10 Studiefinanciering', next: 'd1-out-10' },
        { label: '11 Levenlanglerenkrediet', next: 'd1-out-11' },
        { label: '12 Oriëntatie leer/werk', next: 'd1-out-12' },
        { label: '13 Praktijkleren op maat', next: 'd1-out-13' }
      ]
    },
    'd1-overige-opleiding': {
      id: 'd1-overige-opleiding',
      title: 'Overige opleiding/scholing',
      type: 'question',
      options: [
        { label: '14 Vergoeding door werkgever/UWV/gemeente', next: 'd1-out-14' },
        { label: '15 Alternatieve scholingsmogelijkheden', next: 'd1-out-15' }
      ]
    },

    'd1-out-9': { id: 'd1-out-9', title: '9 Leerwerkloket of regionaal mobiliteitsteam', type: 'outcome', info: { badges: ['#9'] } },
    'd1-out-10': { id: 'd1-out-10', title: '10 Studiefinanciering', type: 'outcome', info: { badges: ['#10'] } },
    'd1-out-11': { id: 'd1-out-11', title: '11 Levenlanglerenkrediet', type: 'outcome', info: { badges: ['#11'] } },
    'd1-out-12': { id: 'd1-out-12', title: '12 Oriëntatie op leerwerk', type: 'outcome', info: { badges: ['#12'] } },
    'd1-out-13': { id: 'd1-out-13', title: '13 Praktijkleren op maat', type: 'outcome', info: { badges: ['#13'] } },
    'd1-out-14': { id: 'd1-out-14', title: '14 Vergoeding door werkgever/UWV/gemeente', type: 'outcome', info: { badges: ['#14'] } },
    'd1-out-15': { id: 'd1-out-15', title: '15 Alternatieve scholingsmogelijkheden', type: 'outcome', info: { badges: ['#15'] } },

    // Onbetaald werkervaring
    'd1-onbetaald': {
      id: 'd1-onbetaald',
      title: 'Onbetaald werkervaring opdoen?',
      type: 'question',
      options: [
        { label: 'Cliënt heeft werk', next: 'd1-onb-werk' },
        { label: 'Cliënt heeft UWV‑uitkering', next: 'd1-onb-uwv' },
        { label: 'Cliënt heeft uitkering gemeente of geen uitkering', next: 'd1-onb-gemeente' }
      ]
    },
    'd1-onb-werk': {
      id: 'd1-onb-werk',
      title: 'Cliënt heeft werk',
      type: 'question',
      options: [
        { label: '16 Afspraken maken met werkgever', next: 'd1-out-16' },
        { label: '17 Vrijwilligerswerk of dagbesteding', next: 'd1-out-17' }
      ]
    },
    'd1-onb-uwv': {
      id: 'd1-onb-uwv',
      title: 'Cliënt heeft UWV‑uitkering',
      type: 'question',
      options: [
        { label: '18 Proefplaatsing', next: 'd1-out-18' }
      ]
    },
    'd1-onb-gemeente': {
      id: 'd1-onb-gemeente',
      title: 'Cliënt heeft uitkering gemeente of geen uitkering',
      type: 'question',
      options: [
        { label: 'Werkgever wil baan bieden → 21 Proefplaats', next: 'd1-out-21' },
        { label: 'Korte periode werkervaring → 22 Werkstage', next: 'd1-out-22' },
        { label: 'Bijstand, kleine kans op werk → 23 Participatieplaats', next: 'd1-out-23' },
        { label: 'Maatschappelijk participeren → 17 Vrijwilligerswerk/dagbesteding', next: 'd1-out-17' }
      ]
    },

    'd1-out-16': { id: 'd1-out-16', title: '16 Afspraken maken met werkgever', type: 'outcome', info: { badges: ['#16'] } },
    'd1-out-17': { id: 'd1-out-17', title: '17 Vrijwilligerswerk / dagbesteding', type: 'outcome', info: { badges: ['#17'] } },
    'd1-out-18': { id: 'd1-out-18', title: '18 Proefplaatsing (UWV)', type: 'outcome', info: { badges: ['#18'] } },
    'd1-out-21': { id: 'd1-out-21', title: '21 Proefplaats', type: 'outcome', info: { badges: ['#21'] } },
    'd1-out-22': { id: 'd1-out-22', title: '22 Werkstage', type: 'outcome', info: { badges: ['#22'] } },
    'd1-out-23': { id: 'd1-out-23', title: '23 Participatieplaats', type: 'outcome', info: { badges: ['#23'] } },

    'd1-alternatief': { id: 'd1-alternatief', title: 'Alternatief traject (lokaal)', type: 'link', info: { badges: ['#6'], links: [{label:'Leerwerkloket', href:'https://www.leerwerkloket.nl/'}] } },

    'd1-verzekering': {
      id: 'd1-verzekering',
      title: 'Heeft de werkgever een ongevallen-/aansprakelijkheidsverzekering nodig?',
      type: 'question',
      options: [
        { label: 'Ja → 24 Praktijkervaringplekpolis (PEP)', next: 'd1-out-24' },
        { label: 'Nee', next: 'd1-end' }
      ]
    },
    'd1-out-24': { id: 'd1-out-24', title: '24 Praktijkervaringplekpolis (PEP‑polis)', type: 'outcome', info: { badges: ['#24'] } },

    // — Deelkaart 4: start eigen bedrijf (nrs. 53–61)
    'd4-start': {
      id: 'd4-start',
      title: 'Aan de slag als ondernemer?',
      type: 'question',
      options: [
        { label: 'Ja', next: 'd4-menu' },
        { label: 'Nee', next: 'd4-end' }
      ],
      info: { badges: ['Deelkaart 4'] }
    },
    'd4-end': { id: 'd4-end', title: 'Einde Deelkaart 4', type: 'outcome' },

    'd4-menu': {
      id: 'd4-menu',
      title: 'Wat heb je nodig bij de start?',
      type: 'question',
      options: [
        { label: '53 Oriëntatie', next: 'd4-out-53' },
        { label: '54 Starterskredieten', next: 'd4-out-54' },
        { label: '55 Arbeidsongeschiktheidsverzekeringen', next: 'd4-out-55' },
        { label: 'Inkomen nodig tijdens eerste periode?', next: 'd4-inkomen' },
        { label: '60 Inkomenssuppletie (gedeeltelijk arbeidsongeschikt)', next: 'd4-out-60' },
        { label: '61 Werkvoorzieningen (hulpmiddelen/aanpassing/vervoer)', next: 'd4-out-61' }
      ]
    },
    'd4-inkomen': {
      id: 'd4-inkomen',
      title: 'Inkomen tijdens start – kies regeling',
      type: 'question',
      options: [
        { label: '56 Bijstand tijdens start', next: 'd4-out-56' },
        { label: '57 WW tijdens start', next: 'd4-out-57' },
        { label: '58 WIA/Wajong/WAO of ZW tijdens start', next: 'd4-out-58' },
        { label: '59 Startersaftrek bij arbeidsongeschiktheid', next: 'd4-out-59' }
      ]
    },

    'd4-out-53': { id: 'd4-out-53', title: '53 Oriëntatie', type: 'outcome', info: { badges: ['#53'] } },
    'd4-out-54': { id: 'd4-out-54', title: '54 Starterskredieten', type: 'outcome', info: { badges: ['#54'] } },
    'd4-out-55': { id: 'd4-out-55', title: '55 Arbeidsongeschiktheidsverzekeringen', type: 'outcome', info: { badges: ['#55'] } },
    'd4-out-56': { id: 'd4-out-56', title: '56 Bijstand tijdens start', type: 'outcome', info: { badges: ['#56'] } },
    'd4-out-57': { id: 'd4-out-57', title: '57 WW tijdens start', type: 'outcome', info: { badges: ['#57'] } },
    'd4-out-58': { id: 'd4-out-58', title: '58 WIA/Wajong/WAO of ZW tijdens start', type: 'outcome', info: { badges: ['#58'] } },
    'd4-out-59': { id: 'd4-out-59', title: '59 Startersaftrek bij arbeidsongeschiktheid', type: 'outcome', info: { badges: ['#59'] } },
    'd4-out-60': { id: 'd4-out-60', title: '60 Inkomenssuppletie', type: 'outcome', info: { badges: ['#60'] } },
    'd4-out-61': { id: 'd4-out-61', title: '61 Werkvoorzieningen', type: 'outcome', info: { badges: ['#61'] } }
  }
};

// ——— Deelkaarten 2 & 3 (SAMENGEV. DATASET) ———
const DATASET_DEELKAARTEN_2_3 /** @type {Dataset} */ = {
  version: 1,
  rootId: 'hub',
  nodes: {
    hub: {
      id: 'hub',
      title: 'Welke deelkaart wil je volgen?',
      description: 'Regelingen voor werkgevers (Deelkaart 2) of Tegemoetkoming cliënt (Deelkaart 3).',
      type: 'question',
      options: [
        { label: 'Deelkaart 2 – Regelingen voor werkgevers', next: 'd2-start' },
        { label: 'Deelkaart 3 – Tegemoetkoming cliënt', next: 'd3-start' }
      ]
    },

    'd2-start': {
      id: 'd2-start',
      title: 'Onbetaald werkervaring opdoen?',
      description: 'Zo ja, bekijk instrumenten op Deelkaart 1 (werkervaringsroutes).',
      type: 'question',
      options: [ { label: 'Ja', next: 'd2-ref-onbetaald' }, { label: 'Nee', next: 'd2-bijdrage-opleiding' } ],
      info: { badges: ['Deelkaart 2'] }
    },
    'd2-ref-onbetaald': { id: 'd2-ref-onbetaald', title: 'Onbetaalde werkervaring → zie Deelkaart 1', description: 'Werkervaringsplaats, participatieplaats, proefplaatsing en werkstage staan op Deelkaart 1 (21–27).', type: 'link', info: { badges: ['Verwijzing', 'DK1 • 21–27'] } },
    'd2-bijdrage-opleiding': { id: 'd2-bijdrage-opleiding', title: 'Bijdrage aan opleiding nodig?', description: 'Zo ja: instrumenten 14 en 15 (financiering/alternatieve scholing).', type: 'question', options: [ { label: 'Ja', next: 'd2-ref-14-15' }, { label: 'Nee', next: 'd2-financiele-voordelen' } ], info: { badges: ['Deelkaart 2'] } },
    'd2-ref-14-15': { id: 'd2-ref-14-15', title: 'Bijdrage aan opleiding → instrumenten 14 & 15', description: 'Zie Deelkaart 1 nrs. 14 en 15.', type: 'link', info: { badges: ['Verwijzing', 'DK1 • 14–15'] } },

    'd2-financiele-voordelen': { id: 'd2-financiele-voordelen', title: 'Financiële voordelen voor werkgever?', description: 'Check mogelijke voordelen (LIV/LKV/subsidies).', type: 'question', options: [ { label: 'Ja, bekijk opties', next: 'd2-check-25' }, { label: 'Nee', next: 'd2-compensatie-extra' } ] },
    'd2-out-25': { id: 'd2-out-25', title: '25 Laag-inkomensvoordeel (LIV)', description: 'Uurloon 100–104% WML (≥21 jaar). Jaarlijkse tegemoetkoming.', type: 'outcome', info: { badges: ['#25', 'LIV'] } },
    'd2-check-25': { id: 'd2-check-25', title: 'Uurloon 100–104% van WML (≥21 jaar)?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-25' }, { label: 'Nee', next: 'd2-check-26' } ], info: { badges: ['#25', 'Deelkaart 2'] } },
    'd2-out-26': { id: 'd2-out-26', title: '26 LKV doelgroep banenafspraak', description: 'Werknemer staat in doelgroepregister banenafspraak.', type: 'outcome', info: { badges: ['#26', 'LKV'] } },
    'd2-check-26': { id: 'd2-check-26', title: 'Werknemer staat in doelgroepregister banenafspraak?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-26' }, { label: 'Nee', next: 'd2-check-27' } ], info: { badges: ['#26', 'Deelkaart 2'] } },
    'd2-out-27': { id: 'd2-out-27', title: '27 LKV scholingsbelemmering', description: 'No-riskverklaring scholingsbelemmeringen.', type: 'outcome', info: { badges: ['#27', 'LKV'] } },
    'd2-check-27': { id: 'd2-check-27', title: 'No-riskverklaring wegens scholingsbelemmeringen?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-27' }, { label: 'Nee', next: 'd2-check-28' } ], info: { badges: ['#27', 'Deelkaart 2'] } },
    'd2-out-28': { id: 'd2-out-28', title: '28 LKV arbeidsbeperking', description: 'WAO/WIA/WAZ of WIA <35% met passend werk.', type: 'outcome', info: { badges: ['#28', 'LKV'] } },
    'd2-check-28': { id: 'd2-check-28', title: 'WAO/WIA/WAZ of WIA <35% met passend werk?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-28' }, { label: 'Nee', next: 'd2-check-29' } ], info: { badges: ['#28', 'Deelkaart 2'] } },
    'd2-out-29': { id: 'd2-out-29', title: '29 LKV herplaatste arbeidsgehandicapte werknemer', description: 'In WIA en blijft in dienst bij werkgever.', type: 'outcome', info: { badges: ['#29', 'LKV'] } },
    'd2-check-29': { id: 'd2-check-29', title: 'Werknemer komt in WIA en blijft in dienst?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-29' }, { label: 'Nee', next: 'd2-check-30' } ], info: { badges: ['#29', 'Deelkaart 2'] } },
    'd2-out-30': { id: 'd2-out-30', title: '30 LKV oudere werknemer (≥56 jaar) met uitkering', description: 'Tegemoetkoming voor oudere uitkeringsgerechtigde.', type: 'outcome', info: { badges: ['#30', 'LKV'] } },
    'd2-check-30': { id: 'd2-check-30', title: 'Werknemer is ≥56 jaar en heeft een uitkering?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-30' }, { label: 'Nee', next: 'd2-check-31' } ], info: { badges: ['#30', 'Deelkaart 2'] } },
    'd2-out-31': { id: 'd2-out-31', title: '31 Subsidie praktijkleren', description: 'BBL/leerwerktraject, jaarlijkse subsidie.', type: 'outcome', info: { badges: ['#31', 'Subsidie'] } },
    'd2-check-31': { id: 'd2-check-31', title: 'Combinatie van werk en leren (BBL/leerwerk)?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-31' }, { label: 'Nee', next: 'd2-check-32' } ], info: { badges: ['#31', 'Deelkaart 2'] } },
    'd2-out-32': { id: 'd2-out-32', title: '32 Stimuleringspremie of tijdelijke loonkostensubsidie', description: 'Participatiewet, gemeentelijke regeling.', type: 'outcome', info: { badges: ['#32', 'Gemeente'] } },
    'd2-check-32': { id: 'd2-check-32', title: 'Werknemer valt onder Participatiewet?', type: 'question', options: [ { label: 'Ja', next: 'd2-out-32' }, { label: 'Nee', next: 'd2-compensatie-extra' } ], info: { badges: ['#32', 'Deelkaart 2'] } },

    'd2-compensatie-extra': { id: 'd2-compensatie-extra', title: 'Compensatie extra kosten/risico?', description: 'Begeleiding, lagere loonwaarde, ziekte/risico of voorzieningen nodig?', type: 'question', options: [ { label: 'Ja', next: 'd2-compensatie-menu' }, { label: 'Nee', next: 'd2-end' } ] },
    'd2-end': { id: 'd2-end', title: 'Einde Deelkaart 2', description: 'Geen aanvullende regelingen geselecteerd.', type: 'outcome', info: { badges: ['Deelkaart 2'] } },

    'd2-compensatie-menu': { id: 'd2-compensatie-menu', title: 'Kies een compensatie', type: 'question', description: 'Selecteer het passende instrument.', options: [ { label: '33 Nazorg of jobcoaching', next: 'd2-out-33' }, { label: '34 Jobcoaching bij structurele beperking', next: 'd2-out-34' }, { label: '35 Beschut werk (intensieve begeleiding)', next: 'd2-out-35' }, { label: '36 Detacheringsbanen (werkgeversrisico beperken)', next: 'd2-out-36' }, { label: '37 No-riskpolis (ziekte/arbeidsongeschiktheid)', next: 'd2-out-37' }, { label: '38 Loondispensatie (Wajong/verminderde loonwaarde)', next: 'd2-out-38' }, { label: '39 (Structurele) loonkostensubsidie', next: 'd2-out-39' }, { label: '40 Werkvoorzieningen/hulpmiddelen', next: 'd2-out-40' } ], info: { badges: ['Deelkaart 2'] } },

    'd2-out-33': { id: 'd2-out-33', title: '33 Nazorg of jobcoaching', description: 'Extra begeleiding voor werknemer/werkgever.', type: 'outcome', info: { badges: ['#33', 'UWV/Gemeente'] } },
    'd2-out-34': { id: 'd2-out-34', title: '34 Jobcoaching bij structurele functionele beperking', description: 'Jobcoach in dienstverband via UWV/gemeente.', type: 'outcome', info: { badges: ['#34', 'UWV/Gemeente'] } },
    'd2-out-35': { id: 'd2-out-35', title: '35 Beschut werk', description: 'Werkplek met permanent toezicht en intensieve begeleiding via gemeente.', type: 'outcome', info: { badges: ['#35', 'Gemeente'] } },
    'd2-out-36': { id: 'd2-out-36', title: '36 Detacheringsbanen', description: 'Detachering vermindert werkgeversrisico.', type: 'outcome', info: { badges: ['#36', 'Gemeente/Intermediair'] } },
    'd2-out-37': { id: 'd2-out-37', title: '37 No-riskpolis', description: 'UWV vergoedt (deel) loonkosten bij ziekte arbeidsbeperkte werknemer.', type: 'outcome', info: { badges: ['#37', 'UWV'] } },
    'd2-out-38': { id: 'd2-out-38', title: '38 Loondispensatie', description: 'Wajong/IVA: loonwaarde lager → werkgever betaalt naar loonwaarde.', type: 'outcome', info: { badges: ['#38', 'UWV'] } },
    'd2-out-39': { id: 'd2-out-39', title: '39 (Structurele) loonkostensubsidie', description: 'Compenseert verminderde loonwaarde.', type: 'outcome', info: { badges: ['#39', 'Gemeente'] } },
    'd2-out-40': { id: 'd2-out-40', title: '40 Werkvoorzieningen', description: 'Hulpmiddelen/aanpassing/vervoer op/voor werk.', type: 'outcome', info: { badges: ['#40', 'UWV/Gemeente'] } },

    'd3-start': { id: 'd3-start', title: 'Financiële tegemoetkoming?', type: 'question', options: [ { label: 'Ja', next: 'd3-fin-menu' }, { label: 'Nee', next: 'd3-extra-zekerheid' } ], info: { badges: ['Deelkaart 3'] } },
    'd3-fin-menu': { id: 'd3-fin-menu', title: 'Waarvoor is de tegemoetkoming?', type: 'question', options: [ { label: 'Vrijwilligerswerk', next: 'd3-out-41' }, { label: 'Studeren — Studietoeslag', next: 'd3-out-42' }, { label: 'Studeren — Voorzieningen onderwijs', next: 'd3-out-43' }, { label: 'Kosten tijdens re‑integratie', next: 'd3-out-44' }, { label: 'Gedeeltelijk arbeidsongeschikt & weer aan het werk', next: 'd3-out-45' }, { label: 'Werk naast bijstand', next: 'd3-out-47' }, { label: 'Uitstroom uit bijstand', next: 'd3-out-48' }, { label: 'Verder: Extra zekerheid', next: 'd3-extra-zekerheid' } ], info: { badges: ['Deelkaart 3'] } },

    'd3-out-41': { id: 'd3-out-41', title: '41 Vrijwilligersvergoedingen', description: 'Onbelaste vergoeding binnen fiscale grenzen.', type: 'outcome', info: { badges: ['#41'] } },
    'd3-out-42': { id: 'd3-out-42', title: '42 Studietoeslag', description: 'Gemeentelijke toeslag voor studenten met beperking.', type: 'outcome', info: { badges: ['#42'] } },
    'd3-out-43': { id: 'd3-out-43', title: '43 Voorzieningen onderwijs', description: 'Aanpassingen/voorzieningen tijdens onderwijs.', type: 'outcome', info: { badges: ['#43'] } },
    'd3-out-44': { id: 'd3-out-44', title: '44 Onkostenvergoeding', description: 'Kosten tijdens re‑integratietraject.', type: 'outcome', info: { badges: ['#44'] } },
    'd3-out-45': { id: 'd3-out-45', title: '45 Loonssuppletie', description: 'Aanvulling op loon bij gedeeltelijke arbeidsgeschiktheid en werkhervatting.', type: 'outcome', info: { badges: ['#45'] } },
    'd3-out-47': { id: 'd3-out-47', title: '47 Vrijlatingsregeling bijstand', description: 'Deel van inkomsten tijdelijk vrijgelaten in de bijstand.', type: 'outcome', info: { badges: ['#47'] } },
    'd3-out-48': { id: 'd3-out-48', title: '48 Stimuleringspremie', description: 'Gemeentelijke premie bij uitstroom uit bijstand.', type: 'outcome', info: { badges: ['#48'] } },

    'd3-extra-zekerheid': { id: 'd3-extra-zekerheid', title: 'Extra zekerheid nodig?', type: 'question', options: [ { label: 'Werk korte tijd → terugval bijstand', next: 'd3-out-49' }, { label: 'Werk korte tijd → terugval UWV‑uitkering', next: 'd3-out-50' }, { label: 'Wisselend inkomen → aangepaste verrekening (bijstand)', next: 'd3-out-51' }, { label: 'Opnieuw arbeidsongeschikt → herleving uitkering', next: 'd3-out-52' }, { label: 'Nee', next: 'd3-einde' } ], info: { badges: ['Deelkaart 3'] } },
    'd3-out-49': { id: 'd3-out-49', title: '49 Terugvalregelingen bijstand', description: 'Terugkeer in bijstand bij einde/vermindering werk (korte duur).', type: 'outcome', info: { badges: ['#49'] } },
    'd3-out-50': { id: 'd3-out-50', title: '50 Terugvalregelingen UWV‑uitkeringen', description: 'Terugkeer in uitkering (WW/WIA/ZW).', type: 'outcome', info: { badges: ['#50'] } },
    'd3-out-51': { id: 'd3-out-51', title: '51 Aangepaste inkomensverrekening bijstand', description: 'Schommelingsbestendig verrekenen.', type: 'outcome', info: { badges: ['#51'] } },
    'd3-out-52': { id: 'd3-out-52', title: '52 Herleving arbeidsongeschiktheidsuitkering', description: 'Heropening bij hernieuwde arbeidsongeschiktheid.', type: 'outcome', info: { badges: ['#52'] } },
    'd3-einde': { id: 'd3-einde', title: 'Einde Deelkaart 3', description: 'Geen extra regelingen geselecteerd.', type: 'outcome' }
  }
};

// — Utilities —
const STORAGE_KEY = 'beslisboom_state_v1';
function classNames(...xs) { return xs.filter(Boolean).join(' '); }

function validateDataset(ds /** @type {Dataset} */) {
  const errors = [];
  if (!ds || typeof ds !== 'object') errors.push('Dataset is geen object.');
  if (!ds.rootId) errors.push('rootId ontbreekt.');
  if (!ds.nodes || typeof ds.nodes !== 'object') errors.push('nodes ontbreekt.');
  if (ds.nodes && ds.rootId && !ds.nodes[ds.rootId]) errors.push(`rootId '${ds.rootId}' bestaat niet in nodes.`);
  for (const node of Object.values(ds.nodes || {})) {
    if (node.type === 'question' && Array.isArray(node.options)) {
      for (const opt of node.options) {
        if (!ds.nodes[opt.next]) errors.push(`Optie '${opt.label}' → next '${opt.next}' bestaat niet.`);
      }
    }
  }
  return errors;
}

function extraValidation(ds /** @type {Dataset} */) {
  const errors = [];
  const warnings = [];
  if (!ds?.nodes || !ds.rootId) return { errors: ['Dataset incompleet'], warnings };
  const visiting = new Set();
  const visited = new Set();
  const nodes = ds.nodes;
  function dfs(id) {
    if (!nodes[id]) return;
    if (visiting.has(id)) { errors.push(`Cyclische verwijzing gedetecteerd bij '${id}'.`); return; }
    if (visited.has(id)) return;
    visiting.add(id);
    visited.add(id);
    const n = nodes[id];
    if (n.type === 'question') {
      if (!Array.isArray(n.options) || n.options.length === 0) {
        warnings.push(`Vraag '${id}' heeft geen opties (dead-end).`);
      } else {
        for (const o of n.options) dfs(o.next);
      }
    }
    visiting.delete(id);
  }
  dfs(ds.rootId);
  for (const id of Object.keys(nodes)) {
    if (!visited.has(id)) warnings.push(`Node '${id}' is onbereikbaar vanaf root.`);
  }
  return { errors, warnings };
}

function enumeratePaths(ds /** @type {Dataset} */) {
  const results = [];
  if (!ds?.nodes) return results;
  function walk(id, steps) {
    const node = ds.nodes[id];
    if (!node) return;
    if (node.type === 'question' && Array.isArray(node.options)) {
      for (const opt of node.options) {
        walk(opt.next, [...steps, { id, title: node.title, option: opt.label }]);
      }
    } else {
      results.push({ steps, outcome: { id: node.id, title: node.title, type: node.type, description: node.description || '' } });
    }
  }
  walk(ds.rootId, []);
  return results;
}

function buildTxtReport(ds /** @type {Dataset} */) {
  const { errors, warnings } = extraValidation(ds);
  const routes = enumeratePaths(ds);
  const lines = [];
  lines.push('Beslisboom-rapport');
  lines.push(`Versie: ${ds.version ?? 'n.v.t.'}`);
  lines.push(`Root: ${ds.rootId}`);
  lines.push(`Totaal nodes: ${Object.keys(ds.nodes||{}).length}`);
  lines.push(`Aantal routes: ${routes.length}`);
  if (errors.length) { lines.push('', 'Fouten:'); for (const e of errors) lines.push(`- ${e}`); }
  if (warnings.length) { lines.push('', 'Waarschuwingen:'); for (const w of warnings) lines.push(`- ${w}`); }
  lines.push('', 'Routes (van start tot uitkomst):');
  routes.forEach((r, i) => {
    lines.push('', `Route ${i+1}: ${r.outcome.title} [${r.outcome.type}] (#${r.outcome.id})`);
    r.steps.forEach((s, idx) => {
      lines.push(`  ${idx+1}. ${s.title} (node: ${s.id})`);
      lines.push(`     → antwoord: ${s.option}`);
    });
    lines.push(`  ► Resultaat: ${r.outcome.title}`);
    if (r.outcome.description) lines.push(`     info: ${r.outcome.description}`);
  });
  return lines.join('\n');
}

function buildCsvReport(ds /** @type {Dataset} */) {
  const routes = enumeratePaths(ds);
  const maxSteps = routes.reduce((m, r) => Math.max(m, r.steps.length), 0);
  const headers = [];
  for (let i = 1; i <= maxSteps; i++) headers.push(`Q${i}`, `A${i}`);
  headers.push('OutcomeId', 'OutcomeTitle', 'OutcomeType');
  const rows = [headers];
  for (const r of routes) {
    const row = [];
    for (let i = 0; i < maxSteps; i++) {
      const s = r.steps[i];
      row.push(s ? s.title.replaceAll('\n', ' ') : '');
      row.push(s ? s.option.replaceAll('\n', ' ') : '');
    }
    row.push(r.outcome.id, r.outcome.title.replaceAll('\n', ' '), r.outcome.type);
    rows.push(row);
  }
  return rows.map(cols => cols.map(csvEscape).join(',')).join('\n');
}
function csvEscape(v) { const s = String(v ?? ''); if (/[",\n]/.test(s)) return '"' + s.replaceAll('"', '""') + '"'; return s; }

function downloadText(filename, content) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function useHashState() {
  const [hash, setHash] = React.useState(() => window.location.hash.slice(1));
  React.useEffect(() => {
    const onHash = () => setHash(window.location.hash.slice(1));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const update = (value) => { window.location.hash = value || ''; };
  return [hash, update];
}

function usePersistedState(key, initial) {
  const [state, setState] = React.useState(() => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : initial; } catch { return initial; }
  });
  React.useEffect(() => { localStorage.setItem(key, JSON.stringify(state)); }, [key, state]);
  return [state, setState];
}

function runSelfTests() {
  try {
    console.groupCollapsed('Beslisboom self-tests');
    let errs = validateDataset(SAMPLE_DATASET);
    console.assert(errs.length === 0, 'Sample dataset valide', errs);
    let routes = enumeratePaths(SAMPLE_DATASET);
    console.assert(routes.length >= 1, 'Sample: ≥1 route');

    errs = validateDataset(DATASET_DEELKAARTEN_1_4);
    console.assert(errs.length === 0, 'DK1+4 dataset valide', errs);
    routes = enumeratePaths(DATASET_DEELKAARTEN_1_4);
    console.assert(routes.length >= 5, 'DK1+4: ≥5 routes', routes.length);

    errs = validateDataset(DATASET_DEELKAARTEN_2_3);
    console.assert(errs.length === 0, 'DK2+3 dataset valide', errs);
    routes = enumeratePaths(DATASET_DEELKAARTEN_2_3);
    console.assert(routes.length >= 8, 'DK2+3: ≥8 routes', routes.length);

    const INVALID = /** @type {any} */({ version: 1, rootId: 'x', nodes: { a: { id: 'a', title: 'A', type: 'question', options: [{label:'ok', next:'b'}] } } });
    const invalidErrs = validateDataset(INVALID);
    console.assert(invalidErrs.length > 0, 'Invalid dataset detectie');

    const txt = buildTxtReport(SAMPLE_DATASET);
    console.assert(txt.includes('\nRoutes (van start tot uitkomst):'), 'TXT export newline');

    const csv = buildCsvReport(SAMPLE_DATASET);
    console.assert(csv.split('\n')[0].startsWith('Q1,A1'), 'CSV headers Q1,A1');

    console.groupEnd();
  } catch (e) { console.error('Self-tests error:', e); }
}
runSelfTests();

export default function App() {
  const [dataset, setDataset] = React.useState(SAMPLE_DATASET);
  const [persist, setPersist] = usePersistedState(STORAGE_KEY, { currentId: SAMPLE_DATASET.rootId, history: [] });
  const [hash, setHash] = useHashState();
  const [qaOpen, setQaOpen] = React.useState(false);
  const [graphOpen, setGraphOpen] = React.useState(false);
  const currentId = hash || persist.currentId || dataset.rootId;

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get('data');
    if (url) {
      (async () => {
        try {
          const res = await fetch(url);
          const json = await res.json();
          const errs = validateDataset(json);
          if (errs.length) throw new Error('Dataset ongeldig: ' + errs.join('\n'));
          setDataset(json);
          setHash(json.rootId);
          setPersist({ currentId: json.rootId, history: [] });
        } catch (e) { alert('Kon dataset niet laden: ' + (e?.message || e)); }
      })();
    }
  }, []);

  React.useEffect(() => {
    if (currentId !== persist.currentId) { setPersist((s) => ({ ...s, currentId })); }
  }, [currentId]);

  const node = dataset.nodes[currentId] || dataset.nodes[dataset.rootId];

  function answer(nextId) {
    setPersist((s) => ({ currentId: nextId, history: [...(s.history||[]), currentId] }));
    setHash(nextId);
  }
  function goBack() {
    setPersist((s) => {
      const h = [...(s.history||[])];
      const prev = h.pop();
      if (!prev) return s;
      setHash(prev);
      return { currentId: prev, history: h };
    });
  }
  function reset() { setPersist({ currentId: dataset.rootId, history: [] }); setHash(dataset.rootId); }
  function share() {
    const shareUrl = window.location.origin + window.location.pathname + window.location.search + '#' + currentId;
    navigator.clipboard.writeText(shareUrl).then(() => alert('Link gekopieerd naar klembord.'));
  }
  function validateNow() {
    const base = validateDataset(dataset); const ext = extraValidation(dataset); const msgs = [];
    if (base.length) msgs.push('Fouten:\n- ' + base.join('\n- '));
    if (ext.errors.length) msgs.push('Extra fouten:\n- ' + ext.errors.join('\n- '));
    if (ext.warnings.length) msgs.push('Waarschuwingen:\n- ' + ext.warnings.join('\n- '));
    alert(msgs.length ? msgs.join('\n\n') : 'Geen problemen gevonden.');
  }
  function exportTxtNow() { downloadText(`beslisboom-${dataset.rootId||'dataset'}.txt`, buildTxtReport(dataset)); }
  function exportCsvNow() { downloadText(`beslisboom-${dataset.rootId||'dataset'}.csv`, buildCsvReport(dataset)); }

  async function onPickFile(ev) {
    const file = ev.target.files?.[0]; if (!file) return;
    try {
      const text = await file.text(); const json = JSON.parse(text);
      const errs = validateDataset(json); if (errs.length) throw new Error('Dataset ongeldig: ' + errs.join('\n'));
      setDataset(json); setPersist({ currentId: json.rootId, history: [] }); setHash(json.rootId);
    } catch (e) { alert('Fout bij laden: ' + (e?.message || e)); }
    finally { ev.target.value = ''; }
  }
  function loadBuiltIn(which) {
    const map = { sample: SAMPLE_DATASET, 'dk1-4': DATASET_DEELKAARTEN_1_4, 'dk2-3': DATASET_DEELKAARTEN_2_3 };
    const ds = map[which]; if (!ds) return;
    const errs = validateDataset(ds); if (errs.length) { alert('Interne dataset ongeldig: ' + errs.join('\n')); return; }
    setDataset(ds); setPersist({ currentId: ds.rootId, history: [] }); setHash(ds.rootId);
  }

  const visitedCount = (persist.history?.length || 0) + 1;
  const qaRoutes = enumeratePaths(dataset);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b">
        <div className="mx-auto max-w-4xl px-4 py-3 flex items-center gap-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border shadow-sm">🔎</span>
            <h1 className="text-lg font-semibold">Beslisboom → Quiz</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <label className="px-3 py-2 rounded-xl border bg-white shadow-sm cursor-pointer text-sm hover:bg-gray-50" title="Laad JSON dataset">
              <input type="file" accept="application/json" className="hidden" onChange={onPickFile} />
              Dataset laden
            </label>
            <select onChange={(e) => loadBuiltIn(e.target.value)} defaultValue="" className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm">
              <option value="" disabled>Voorbeeld datasets…</option>
              <option value="sample">Voorbeeld (kleine subset)</option>
              <option value="dk1-4">Deelkaart 1 + 4 (hub)</option>
              <option value="dk2-3">Deelkaart 2 + 3 (hub)</option>
            </select>
            <button onClick={validateNow} className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm hover:bg-gray-50" aria-label="Valideer dataset">Valideer</button>
            <button onClick={exportTxtNow} className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm hover:bg-gray-50" aria-label="Exporteer TXT">Export TXT</button>
            <button onClick={exportCsvNow} className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm hover:bg-gray-50" aria-label="Exporteer CSV">Export CSV</button>
            <button onClick={() => alert(SYSTEM_PROMPT_FOR_YOUR_GPT)} className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm hover:bg-gray-50">GPT‑instructie</button>
            <button onClick={() => setQaOpen((v)=>!v)} className="px-3 py-2 rounded-xl border bg-white shadow-sm text-sm hover:bg-gray-50" aria-pressed={qaRoutes}>{qaOpen ? 'QA‑routes (aan)' : 'QA‑routes'}</button>
          </div>
        </div>
        <div className="mx-auto max-w-4xl px-4 pb-3">
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden" aria-hidden>
            <div className="h-2 bg-gray-800" style={{ width: Math.min(100, visitedCount * 8) + '%' }} />
          </div>
          <p className="mt-1 text-xs text-gray-500">Bezochte stappen: {visitedCount}</p>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-6">
        <Breadcrumbs dataset={dataset} history={persist.history} currentId={currentId} />

        <article className="mt-4 rounded-2xl border bg-white shadow-sm p-5">
          <NodeView node={node} onAnswer={answer} />
        </article>

        <section className="mt-6 rounded-2xl border bg-white shadow-sm p-5">
          <h2 className="text-base font-semibold">Dataset info</h2>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-gray-500">Versie</dt>
              <dd>{dataset.version}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Root</dt>
              <dd><code className="bg-gray-100 rounded px-1">{dataset.rootId}</code></dd>
            </div>
            <div className="col-span-2">
              <dt className="text-gray-500">Nodes</dt>
              <dd className="text-gray-700">{Object.keys(dataset.nodes).length}</dd>
            </div>
          </dl>
          <details className="mt-3 group">
            <summary className="cursor-pointer text-sm text-gray-700 group-open:font-semibold">JSON schema (voorbeeld)</summary>
            <pre className="mt-2 text-xs overflow-x-auto bg-gray-50 p-3 rounded-xl border"><code>{JSON.stringify({
              version: 1,
              rootId: 'start',
              nodes: { example: { id: 'example', title: 'Voorbeeldvraag', description: 'Optionele uitleg', type: 'question', options: [{ label: 'Ja', next: 'x' }, { label: 'Nee', next: 'y' }], info: { badges: ['Deelkaart'], links: [{label: 'URL', href: 'https://...'}], notes: 'Korte notitie' } } }
            }, null, 2)}</code></pre>
          </details>
        </section>

        {qaOpen && (
          <section className="mt-6 rounded-2xl border bg-white shadow-sm p-5">
            <h2 className="text-base font-semibold">QA — Routes</h2>
            <p className="mt-1 text-sm text-gray-600">Totaal: {qaRoutes.length}</p>
            <ol className="mt-3 space-y-3 text-sm">
              {qaRoutes.map((r, i) => (
                <li key={i} className="p-3 rounded-xl border bg-gray-50">
                  <div className="font-medium">Route {i+1} → <span className="px-1 rounded bg-white border">{r.outcome.id}</span> {r.outcome.title}</div>
                  <ul className="mt-2 space-y-1">
                    {r.steps.map((s, j) => (
                      <li key={j} className="flex flex-wrap gap-2">
                        <span className="px-2 py-0.5 rounded bg-white border">Q{j+1}</span>
                        <span className="font-medium">{s.title}</span>
                        <span className="text-gray-500">→</span>
                        <span>{s.option}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-4xl px-4 py-10 text-center text-xs text-gray-500">
        Gemaakt voor Replit • JSON‑gedreven • Mobile‑first
      </footer>
    </div>
  );
}

function Breadcrumbs({ dataset, history, currentId }) {
  const ids = [...(history||[]), currentId];
  return (
    <nav className="text-xs text-gray-600" aria-label="Breadcrumb">
      <ol className="flex flex-wrap gap-1 items-center">
        {ids.map((id, i) => (
          <li key={id} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>›</span>}
            <a href={`#${id}`} className="px-2 py-1 rounded-lg hover:bg-gray-100 border">
              {dataset.nodes[id]?.title || id}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function NodeView({ node, onAnswer }) {
  if (!node) return <p className="text-red-600">Onbekende node.</p>;
  const badgeList = node.info?.badges || [];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-xl font-bold">{node.title}</h2>
        {badgeList.map((b, i) => (
          <span key={i} className="text-[10px] px-2 py-1 rounded-full bg-gray-100 border">{b}</span>
        ))}
      </div>
      {node.description && (
        <p className="mt-2 text-gray-700 leading-relaxed">{node.description}</p>
      )}

      {node.type === 'question' && (
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {node.options?.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => onAnswer(opt.next)}
              className="w-full text-left px-4 py-4 rounded-2xl border shadow-sm hover:shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-black"
            >
              <div className="text-base font-medium">{opt.label}</div>
              <div className="text-xs text-gray-500 mt-1">Ga door →</div>
            </button>
          ))}
        </div>
      )}

      {node.type !== 'question' && (
        <div className="mt-5">
          {node.type === 'outcome' && (
            <div className="rounded-xl border bg-gray-50 p-4">
              <p className="text-sm text-gray-800">{node.description || 'Resultaat'}</p>
            </div>
          )}
          {node.type === 'link' && (
            <div className="rounded-xl border bg-blue-50 p-4">
              <p className="text-sm text-gray-800">{node.description || 'Meer informatie'}</p>
            </div>
          )}
          {!!node.info?.links?.length && (
            <ul className="mt-3 space-y-2">
              {node.info.links.map((l, i) => (
                <li key={i}>
                  <a className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border bg-white shadow-sm hover:bg-gray-50" href={l.href} target="_blank" rel="noreferrer">
                    <span className="truncate max-w-[22ch]">{l.label}</span>
                    <span aria-hidden>↗</span>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// FILE: /public/datasets/sample.json
{
  "version": 1,
  "rootId": "start",
  "nodes": {
    "start": { "id": "start", "title": "Begeleiding naar werk?", "description": "Wil de cliënt begeleiding bij het vinden of behouden van werk? (Stap 1)", "type": "question", "options": [ { "label": "Ja", "next": "situatie" }, { "label": "Nee", "next": "einde-geen-verdere-stappen" } ], "info": { "badges": ["Deelkaart 1 • Stap 1"] } },
    "einde-geen-verdere-stappen": { "id": "einde-geen-verdere-stappen", "title": "Einde — geen verdere stappen", "description": "Er is geen traject nodig op dit moment.", "type": "outcome", "info": { "badges": ["Deelkaart 1"], "notes": "Kies “Herstart” om opnieuw te beginnen." } },
    "situatie": { "id": "situatie", "title": "Wat is van toepassing?", "description": "Kies de huidige status van de cliënt. (Stap 2)", "type": "question", "options": [ { "label": "Cliënt heeft werk", "next": "werk-ondersteuning-werkgever" }, { "label": "Cliënt heeft uitkering", "next": "uitkering-ondersteuning" }, { "label": "Geen werk en geen uitkering", "next": "geen-werk-gemeente" }, { "label": "Alternatief traject (lokaal)", "next": "alternatief-traject" } ], "info": { "badges": ["Deelkaart 1 • Stap 2"] } },
    "werk-ondersteuning-werkgever": { "id": "werk-ondersteuning-werkgever", "title": "Ondersteuning door de werkgever", "description": "Werkgever kan begeleiden of netwerk inzetten. Meer intensieve ondersteuning nodig?", "type": "question", "options": [ { "label": "Ja → Re-integratietraject via werkgever", "next": "reint-werkgever" }, { "label": "Nee → Route eindigt", "next": "einde-route-werkgever" } ], "info": { "badges": ["#1 • Deelkaart 1"] } },
    "reint-werkgever": { "id": "reint-werkgever", "title": "Re-integratietraject via werkgever", "description": "Werkgever schakelt re-integratiebedrijf in.", "type": "outcome", "info": { "badges": ["#2 • Deelkaart 1"], "notes": "Vervolg kan leiden naar Deelkaart 2 of 3, afhankelijk van keuzes." } },
    "einde-route-werkgever": { "id": "einde-route-werkgever", "title": "Einde van dit pad", "description": "Geen traject via werkgever. Herstart of kies een ander pad.", "type": "outcome", "info": { "badges": ["Deelkaart 1"] } },
    "uitkering-ondersteuning": { "id": "uitkering-ondersteuning", "title": "Ondersteuning door UWV of gemeente", "description": "Meer intensieve ondersteuning nodig?", "type": "question", "options": [ { "label": "UWV → Re-integratietraject", "next": "reint-uwv" }, { "label": "Gemeente → Re-integratietraject", "next": "reint-gemeente" }, { "label": "Nee", "next": "einde-geen-intensief" } ], "info": { "badges": ["#3 • Deelkaart 1"] } },
    "reint-uwv": { "id": "reint-uwv", "title": "Re-integratietraject via UWV", "description": "UWV koopt trajecten in bij een re-integratiebedrijf.", "type": "outcome", "info": { "badges": ["#4 • Deelkaart 1"], "links": [ { "label": "UWV — Re-integratie", "href": "https://www.uwv.nl/particulieren/werken-met-een-beperking/re-integratie/index.aspx" } ] } },
    "reint-gemeente": { "id": "reint-gemeente", "title": "Re-integratietraject via gemeente", "description": "Gemeente koopt trajecten in of zet mobiliteitsteam in.", "type": "outcome", "info": { "badges": ["#5 • Deelkaart 1"], "links": [ { "label": "Rijksoverheid — Participatiewet", "href": "https://www.rijksoverheid.nl/onderwerpen/participatiewet" } ] } },
    "einde-geen-intensief": { "id": "einde-geen-intensief", "title": "Einde — geen intensieve ondersteuning", "description": "Kies herstart om opnieuw te beginnen.", "type": "outcome", "info": { "badges": ["Deelkaart 1"] } },
    "geen-werk-gemeente": { "id": "geen-werk-gemeente", "title": "Ondersteuning door gemeente (geen werk/uitkering)", "description": "Meer intensieve begeleiding nodig?", "type": "question", "options": [ { "label": "Ja → Re-integratietraject via gemeente", "next": "reint-gemeente" }, { "label": "Nee", "next": "einde-geen-traject" } ], "info": { "badges": ["#7/#8 • Deelkaart 1"] } },
    "einde-geen-traject": { "id": "einde-geen-traject", "title": "Einde — geen traject", "description": "Herstart om opnieuw te kiezen.", "type": "outcome" },
    "alternatief-traject": { "id": "alternatief-traject", "title": "Alternatief traject (lokaal)", "description": "Regionaal mobiliteitsteam, fondsen, leerwerkloketten. Gaat door naar opleiding & werkervaring.", "type": "link", "info": { "badges": ["#6 • Deelkaart 1"], "links": [ { "label": "Leerwerkloket", "href": "https://www.leerwerkloket.nl/" } ] } }
  }
}

// FILE: /public/datasets/dk1-4-hub.json
{
  "version": 1,
  "rootId": "hub",
  "nodes": {
    "hub": { "id": "hub", "title": "Kies deelkaart", "description": "Volg Deelkaart 1 (Trajecten/opleiding/werkervaring) of Deelkaart 4 (Start eigen bedrijf).", "type": "question", "options": [ { "label": "Deelkaart 1 – Arbeidsmarktkansen vergroten", "next": "d1-start" }, { "label": "Deelkaart 4 – Hulp bij start eigen bedrijf", "next": "d4-start" } ] },
    "d1-start": { "id": "d1-start", "title": "Begeleiding naar werk?", "description": "Start Deelkaart 1.", "type": "question", "options": [ { "label": "Ja", "next": "d1-situatie" }, { "label": "Nee", "next": "d1-end" } ], "info": { "badges": ["Deelkaart 1"] } },
    "d1-end": { "id": "d1-end", "title": "Einde Deelkaart 1", "type": "outcome" },
    "d1-situatie": { "id": "d1-situatie", "title": "Wat is voor jouw cliënt van toepassing?", "type": "question", "options": [ { "label": "Cliënt heeft werk", "next": "d1-werkgever-route" }, { "label": "Cliënt heeft uitkering", "next": "d1-uitkering-route" }, { "label": "Cliënt heeft geen werk of uitkering", "next": "d1-gemeente-route" }, { "label": "Alternatief traject (lokaal)", "next": "d1-alternatief" }, { "label": "Extra opleiding?", "next": "d1-extra-opleiding" }, { "label": "Onbetaald werkervaring opdoen?", "next": "d1-onbetaald" } ] },
    "d1-extra-opleiding": { "id": "d1-extra-opleiding", "title": "Wat heeft jouw cliënt nodig? (opleiding)", "type": "question", "options": [ { "label": "Hulp bij studiekeuze", "next": "d1-out-9" }, { "label": "Regulier onderwijs (financiering)", "next": "d1-onderwijs" }, { "label": "Overige opleiding/scholing", "next": "d1-overige-opleiding" } ], "info": { "badges": ["DK1 • opleiding"] } },
    "d1-onderwijs": { "id": "d1-onderwijs", "title": "Regulier onderwijs – wat past?", "type": "question", "options": [ { "label": "10 Studiefinanciering", "next": "d1-out-10" }, { "label": "11 Levenlanglerenkrediet", "next": "d1-out-11" }, { "label": "12 Oriëntatie leer/werk", "next": "d1-out-12" }, { "label": "13 Praktijkleren op maat", "next": "d1-out-13" } ] },
    "d1-overige-opleiding": { "id": "d1-overige-opleiding", "title": "Overige opleiding/scholing", "type": "question", "options": [ { "label": "14 Vergoeding door werkgever/UWV/gemeente", "next": "d1-out-14" }, { "label": "15 Alternatieve scholingsmogelijkheden", "next": "d1-out-15" } ] },
    "d1-out-9": { "id": "d1-out-9", "title": "9 Leerwerkloket of regionaal mobiliteitsteam", "type": "outcome", "info": { "badges": ["#9"] } },
    "d1-out-10": { "id": "d1-out-10", "title": "10 Studiefinanciering", "type": "outcome", "info": { "badges": ["#10"] } },
    "d1-out-11": { "id": "d1-out-11", "title": "11 Levenlanglerenkrediet", "type": "outcome", "info": { "badges": ["#11"] } },
    "d1-out-12": { "id": "d1-out-12", "title": "12 Oriëntatie op leerwerk", "type": "outcome", "info": { "badges": ["#12"] } },
    "d1-out-13": { "id": "d1-out-13", "title": "13 Praktijkleren op maat", "type": "outcome", "info": { "badges": ["#13"] } },
    "d1-out-14": { "id": "d1-out-14", "title": "14 Vergoeding door werkgever/UWV/gemeente", "type": "outcome", "info": { "badges": ["#14"] } },
    "d1-out-15": { "id": "d1-out-15", "title": "15 Alternatieve scholingsmogelijkheden", "type": "outcome", "info": { "badges": ["#15"] } },
    "d1-onbetaald": { "id": "d1-onbetaald", "title": "Onbetaald werkervaring opdoen?", "type": "question", "options": [ { "label": "Cliënt heeft werk", "next": "d1-onb-werk" }, { "label": "Cliënt heeft UWV‑uitkering", "next": "d1-onb-uwv" }, { "label": "Cliënt heeft uitkering gemeente of geen uitkering", "next": "d1-onb-gemeente" } ] },
    "d1-onb-werk": { "id": "d1-onb-werk", "title": "Cliënt heeft werk", "type": "question", "options": [ { "label": "16 Afspraken maken met werkgever", "next": "d1-out-16" }, { "label": "17 Vrijwilligerswerk of dagbesteding", "next": "d1-out-17" } ] },
    "d1-onb-uwv": { "id": "d1-onb-uwv", "title": "Cliënt heeft UWV‑uitkering", "type": "question", "options": [ { "label": "18 Proefplaatsing", "next": "d1-out-18" } ] },
    "d1-onb-gemeente": { "id": "d1-onb-gemeente", "title": "Cliënt heeft uitkering gemeente of geen uitkering", "type": "question", "options": [ { "label": "Werkgever wil baan bieden → 21 Proefplaats", "next": "d1-out-21" }, { "label": "Korte periode werkervaring → 22 Werkstage", "next": "d1-out-22" }, { "label": "Bijstand, kleine kans op werk → 23 Participatieplaats", "next": "d1-out-23" }, { "label": "Maatschappelijk participeren → 17 Vrijwilligerswerk/dagbesteding", "next": "d1-out-17" } ] },
    "d1-out-16": { "id": "d1-out-16", "title": "16 Afspraken maken met werkgever", "type": "outcome", "info": { "badges": ["#16"] } },
    "d1-out-17": { "id": "d1-out-17", "title": "17 Vrijwilligerswerk / dagbesteding", "type": "outcome", "info": { "badges": ["#17"] } },
    "d1-out-18": { "id": "d1-out-18", "title": "18 Proefplaatsing (UWV)", "type": "outcome", "info": { "badges": ["#18"] } },
    "d1-out-21": { "id": "d1-out-21", "title": "21 Proefplaats", "type": "outcome", "info": { "badges": ["#21"] } },
    "d1-out-22": { "id": "d1-out-22", "title": "22 Werkstage", "type": "outcome", "info": { "badges": ["#22"] } },
    "d1-out-23": { "id": "d1-out-23", "title": "23 Participatieplaats", "type": "outcome", "info": { "badges": ["#23"] } },
    "d1-alternatief": { "id": "d1-alternatief", "title": "Alternatief traject (lokaal)", "type": "link", "info": { "badges": ["#6"], "links": [ { "label": "Leerwerkloket", "href": "https://www.leerwerkloket.nl/" } ] } },
    "d1-verzekering": { "id": "d1-verzekering", "title": "Heeft de werkgever een ongevallen-/aansprakelijkheidsverzekering nodig?", "type": "question", "options": [ { "label": "Ja → 24 Praktijkervaringplekpolis (PEP)", "next": "d1-out-24" }, { "label": "Nee", "next": "d1-end" } ] },
    "d1-out-24": { "id": "d1-out-24", "title": "24 Praktijkervaringplekpolis (PEP‑polis)", "type": "outcome", "info": { "badges": ["#24"] } },
    "d4-start": { "id": "d4-start", "title": "Aan de slag als ondernemer?", "type": "question", "options": [ { "label": "Ja", "next": "d4-menu" }, { "label": "Nee", "next": "d4-end" } ], "info": { "badges": ["Deelkaart 4"] } },
    "d4-end": { "id": "d4-end", "title": "Einde Deelkaart 4", "type": "outcome" },
    "d4-menu": { "id": "d4-menu", "title": "Wat heb je nodig bij de start?", "type": "question", "options": [ { "label": "53 Oriëntatie", "next": "d4-out-53" }, { "label": "54 Starterskredieten", "next": "d4-out-54" }, { "label": "55 Arbeidsongeschiktheidsverzekeringen", "next": "d4-out-55" }, { "label": "Inkomen nodig tijdens eerste periode?", "next": "d4-inkomen" }, { "label": "60 Inkomenssuppletie (gedeeltelijk arbeidsongeschikt)", "next": "d4-out-60" }, { "label": "61 Werkvoorzieningen (hulpmiddelen/aanpassing/vervoer)", "next": "d4-out-61" } ] },
    "d4-inkomen": { "id": "d4-inkomen", "title": "Inkomen tijdens start – kies regeling", "type": "question", "options": [ { "label": "56 Bijstand tijdens start", "next": "d4-out-56" }, { "label": "57 WW tijdens start", "next": "d4-out-57" }, { "label": "58 WIA/Wajong/WAO of ZW tijdens start", "next": "d4-out-58" }, { "label": "59 Startersaftrek bij arbeidsongeschiktheid", "next": "d4-out-59" } ] },
    "d4-out-53": { "id": "d4-out-53", "title": "53 Oriëntatie", "type": "outcome", "info": { "badges": ["#53"] } },
    "d4-out-54": { "id": "d4-out-54", "title": "54 Starterskredieten", "type": "outcome", "info": { "badges": ["#54"] } },
    "d4-out-55": { "id": "d4-out-55", "title": "55 Arbeidsongeschiktheidsverzekeringen", "type": "outcome", "info": { "badges": ["#55"] } },
    "d4-out-56": { "id": "d4-out-56", "title": "56 Bijstand tijdens start", "type": "outcome", "info": { "badges": ["#56"] } },
    "d4-out-57": { "id": "d4-out-57", "title": "57 WW tijdens start", "type": "outcome", "info": { "badges": ["#57"] } },
    "d4-out-58": { "id": "d4-out-58", "title": "58 WIA/Wajong/WAO of ZW tijdens start", "type": "outcome", "info": { "badges": ["#58"] } },
    "d4-out-59": { "id": "d4-out-59", "title": "59 Startersaftrek bij arbeidsongeschiktheid", "type": "outcome", "info": { "badges": ["#59"] } },
    "d4-out-60": { "id": "d4-out-60", "title": "60 Inkomenssuppletie", "type": "outcome", "info": { "badges": ["#60"] } },
    "d4-out-61": { "id": "d4-out-61", "title": "61 Werkvoorzieningen", "type": "outcome", "info": { "badges": ["#61"] } }
  }
}

// FILE: /public/datasets/dk2-3-hub.json
{
  "version": 1,
  "rootId": "hub",
  "nodes": {
    "hub": { "id": "hub", "title": "Welke deelkaart wil je volgen?", "description": "Regelingen voor werkgevers (Deelkaart 2) of Tegemoetkoming cliënt (Deelkaart 3).", "type": "question", "options": [ { "label": "Deelkaart 2 – Regelingen voor werkgevers", "next": "d2-start" }, { "label": "Deelkaart 3 – Tegemoetkoming cliënt", "next": "d3-start" } ] },
    "d2-start": { "id": "d2-start", "title": "Onbetaald werkervaring opdoen?", "description": "Zo ja, bekijk instrumenten op Deelkaart 1 (werkervaringsroutes).", "type": "question", "options": [ { "label": "Ja", "next": "d2-ref-onbetaald" }, { "label": "Nee", "next": "d2-bijdrage-opleiding" } ], "info": { "badges": ["Deelkaart 2"] } },
    "d2-ref-onbetaald": { "id": "d2-ref-onbetaald", "title": "Onbetaalde werkervaring → zie Deelkaart 1", "description": "Werkervaringsplaats, participatieplaats, proefplaatsing en werkstage staan op Deelkaart 1 (21–27).", "type": "link", "info": { "badges": ["Verwijzing", "DK1 • 21–27"] } },
    "d2-bijdrage-opleiding": { "id": "d2-bijdrage-opleiding", "title": "Bijdrage aan opleiding nodig?", "description": "Zo ja: instrumenten 14 en 15 (financiering/alternatieve scholing).", "type": "question", "options": [ { "label": "Ja", "next": "d2-ref-14-15" }, { "label": "Nee", "next": "d2-financiele-voordelen" } ], "info": { "badges": ["Deelkaart 2"] } },
    "d2-ref-14-15": { "id": "d2-ref-14-15", "title": "Bijdrage aan opleiding → instrumenten 14 & 15", "description": "Zie Deelkaart 1 nrs. 14 en 15.", "type": "link", "info": { "badges": ["Verwijzing", "DK1 • 14–15"] } },
    "d2-financiele-voordelen": { "id": "d2-financiele-voordelen", "title": "Financiële voordelen voor werkgever?", "description": "Check mogelijke voordelen (LIV/LKV/subsidies).", "type": "question", "options": [ { "label": "Ja, bekijk opties", "next": "d2-check-25" }, { "label": "Nee", "next": "d2-compensatie-extra" } ] },
    "d2-out-25": { "id": "d2-out-25", "title": "25 Laag-inkomensvoordeel (LIV)", "description": "Uurloon 100–104% WML (≥21 jaar). Jaarlijkse tegemoetkoming.", "type": "outcome", "info": { "badges": ["#25", "LIV"] } },
    "d2-check-25": { "id": "d2-check-25", "title": "Uurloon 100–104% van WML (≥21 jaar)?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-25" }, { "label": "Nee", "next": "d2-check-26" } ], "info": { "badges": ["#25", "Deelkaart 2"] } },
    "d2-out-26": { "id": "d2-out-26", "title": "26 LKV doelgroep banenafspraak", "description": "Werknemer staat in doelgroepregister banenafspraak.", "type": "outcome", "info": { "badges": ["#26", "LKV"] } },
    "d2-check-26": { "id": "d2-check-26", "title": "Werknemer staat in doelgroepregister banenafspraak?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-26" }, { "label": "Nee", "next": "d2-check-27" } ], "info": { "badges": ["#26", "Deelkaart 2"] } },
    "d2-out-27": { "id": "d2-out-27", "title": "27 LKV scholingsbelemmering", "description": "No-riskverklaring scholingsbelemmeringen.", "type": "outcome", "info": { "badges": ["#27", "LKV"] } },
    "d2-check-27": { "id": "d2-check-27", "title": "No-riskverklaring wegens scholingsbelemmeringen?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-27" }, { "label": "Nee", "next": "d2-check-28" } ], "info": { "badges": ["#27", "Deelkaart 2"] } },
    "d2-out-28": { "id": "d2-out-28", "title": "28 LKV arbeidsbeperking", "description": "WAO/WIA/WAZ of WIA <35% met passend werk.", "type": "outcome", "info": { "badges": ["#28", "LKV"] } },
    "d2-check-28": { "id": "d2-check-28", "title": "WAO/WIA/WAZ of WIA <35% met passend werk?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-28" }, { "label": "Nee", "next": "d2-check-29" } ], "info": { "badges": ["#28", "Deelkaart 2"] } },
    "d2-out-29": { "id": "d2-out-29", "title": "29 LKV herplaatste arbeidsgehandicapte werknemer", "description": "In WIA en blijft in dienst bij werkgever.", "type": "outcome", "info": { "badges": ["#29", "LKV"] } },
    "d2-check-29": { "id": "d2-check-29", "title": "Werknemer komt in WIA en blijft in dienst?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-29" }, { "label": "Nee", "next": "d2-check-30" } ], "info": { "badges": ["#29", "Deelkaart 2"] } },
    "d2-out-30": { "id": "d2-out-30", "title": "30 LKV oudere werknemer (≥56 jaar) met uitkering", "description": "Tegemoetkoming voor oudere uitkeringsgerechtigde.", "type": "outcome", "info": { "badges": ["#30", "LKV"] } },
    "d2-check-30": { "id": "d2-check-30", "title": "Werknemer is ≥56 jaar en heeft een uitkering?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-30" }, { "label": "Nee", "next": "d2-check-31" } ], "info": { "badges": ["#30", "Deelkaart 2"] } },
    "d2-out-31": { "id": "d2-out-31", "title": "31 Subsidie praktijkleren", "description": "BBL/leerwerktraject, jaarlijkse subsidie.", "type": "outcome", "info": { "badges": ["#31", "Subsidie"] } },
    "d2-check-31": { "id": "d2-check-31", "title": "Combinatie van werk en leren (BBL/leerwerk)?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-31" }, { "label": "Nee", "next": "d2-check-32" } ], "info": { "badges": ["#31", "Deelkaart 2"] } },
    "d2-out-32": { "id": "d2-out-32", "title": "32 Stimuleringspremie of tijdelijke loonkostensubsidie", "description": "Participatiewet, gemeentelijke regeling.", "type": "outcome", "info": { "badges": ["#32", "Gemeente"] } },
    "d2-check-32": { "id": "d2-check-32", "title": "Werknemer valt onder Participatiewet?", "type": "question", "options": [ { "label": "Ja", "next": "d2-out-32" }, { "label": "Nee", "next": "d2-compensatie-extra" } ], "info": { "badges": ["#32", "Deelkaart 2"] } },
    "d2-compensatie-extra": { "id": "d2-compensatie-extra", "title": "Compensatie extra kosten/risico?", "description": "Begeleiding, lagere loonwaarde, ziekte/risico of voorzieningen nodig?", "type": "question", "options": [ { "label": "Ja", "next": "d2-compensatie-menu" }, { "label": "Nee", "next": "d2-end" } ] },
    "d2-end": { "id": "d2-end", "title": "Einde Deelkaart 2", "description": "Geen aanvullende regelingen geselecteerd.", "type": "outcome", "info": { "badges": ["Deelkaart 2"] } },
    "d2-compensatie-menu": { "id": "d2-compensatie-menu", "title": "Kies een compensatie", "type": "question", "description": "Selecteer het passende instrument.", "options": [ { "label": "33 Nazorg of jobcoaching", "next": "d2-out-33" }, { "label": "34 Jobcoaching bij structurele beperking", "next": "d2-out-34" }, { "label": "35 Beschut werk (intensieve begeleiding)", "next": "d2-out-35" }, { "label": "36 Detacheringsbanen (werkgeversrisico beperken)", "next": "d2-out-36" }, { "label": "37 No-riskpolis (ziekte/arbeidsongeschiktheid)", "next": "d2-out-37" }, { "label": "38 Loondispensatie (Wajong/verminderde loonwaarde)", "next": "d2-out-38" }, { "label": "39 (Structurele) loonkostensubsidie", "next": "d2-out-39" }, { "label": "40 Werkvoorzieningen/hulpmiddelen", "next": "d2-out-40" } ], "info": { "badges": ["Deelkaart 2"] } },
    "d2-out-33": { "id": "d2-out-33", "title": "33 Nazorg of jobcoaching", "description": "Extra begeleiding voor werknemer/werkgever.", "type": "outcome", "info": { "badges": ["#33", "UWV/Gemeente"] } },
    "d2-out-34": { "id": "d2-out-34", "title": "34 Jobcoaching bij structurele functionele beperking", "description": "Jobcoach in dienstverband via UWV/gemeente.", "type": "outcome", "info": { "badges": ["#34", "UWV/Gemeente"] } },
    "d2-out-35": { "id": "d2-out-35", "title": "35 Beschut werk", "description": "Werkplek met permanent toezicht en intensieve begeleiding via gemeente.", "type": "outcome", "info": { "badges": ["#35", "Gemeente"] } },
    "d2-out-36": { "id": "d2-out-36", "title": "36 Detacheringsbanen", "description": "Detachering vermindert werkgeversrisico.", "type": "outcome", "info": { "badges": ["#36", "Gemeente/Intermediair"] } },
    "d2-out-37": { "id": "d2-out-37", "title": "37 No-riskpolis", "description": "UWV vergoedt (deel) loonkosten bij ziekte arbeidsbeperkte werknemer.", "type": "outcome", "info": { "badges": ["#37", "UWV"] } },
    "d2-out-38": { "id": "d2-out-38", "title": "38 Loondispensatie", "description": "Wajong/IVA: loonwaarde lager → werkgever betaalt naar loonwaarde.", "type": "outcome", "info": { "badges": ["#38", "UWV"] } },
    "d2-out-39": { "id": "d2-out-39", "title": "39 (Structurele) loonkostensubsidie", "description": "Compenseert verminderde loonwaarde.", "type": "outcome", "info": { "badges": ["#39", "Gemeente"] } },
    "d2-out-40": { "id": "d2-out-40", "title": "40 Werkvoorzieningen", "description": "Hulpmiddelen/aanpassing/vervoer op/voor werk.", "type": "outcome", "info": { "badges": ["#40", "UWV/Gemeente"] } },
    "d3-start": { "id": "d3-start", "title": "Financiële tegemoetkoming?", "type": "question", "options": [ { "label": "Ja", "next": "d3-fin-menu" }, { "label": "Nee", "next": "d3-extra-zekerheid" } ], "info": { "badges": ["Deelkaart 3"] } },
    "d3-fin-menu": { "id": "d3-fin-menu", "title": "Waarvoor is de tegemoetkoming?", "type": "question", "options": [ { "label": "Vrijwilligerswerk", "next": "d3-out-41" }, { "label": "Studeren — Studietoeslag", "next": "d3-out-42" }, { "label": "Studeren — Voorzieningen onderwijs", "next": "d3-out-43" }, { "label": "Kosten tijdens re‑integratie", "next": "d3-out-44" }, { "label": "Gedeeltelijk arbeidsongeschikt & weer aan het werk", "next": "d3-out-45" }, { "label": "Werk naast bijstand", "next": "d3-out-47" }, { "label": "Uitstroom uit bijstand", "next": "d3-out-48" }, { "label": "Verder: Extra zekerheid", "next": "d3-extra-zekerheid" } ], "info": { "badges": ["Deelkaart 3"] } },
    "d3-out-41": { "id": "d3-out-41", "title": "41 Vrijwilligersvergoedingen", "description": "Onbelaste vergoeding binnen fiscale grenzen.", "type": "outcome", "info": { "badges": ["#41"] } },
    "d3-out-42": { "id": "d3-out-42", "title": "42 Studietoeslag", "description": "Gemeentelijke toeslag voor studenten met beperking.", "type": "outcome", "info": { "badges": ["#42"] } },
    "d3-out-43": { "id": "d3-out-43", "title": "43 Voorzieningen onderwijs", "description": "Aanpassingen/voorzieningen tijdens onderwijs.", "type": "outcome", "info": { "badges": ["#43"] } },
    "d3-out-44": { "id": "d3-out-44", "title": "44 Onkostenvergoeding", "description": "Kosten tijdens re‑integratietraject.", "type": "outcome", "info": { "badges": ["#44"] } },
    "d3-out-45": { "id": "d3-out-45", "title": "45 Loonssuppletie", "description": "Aanvulling op loon bij gedeeltelijke arbeidsgeschiktheid en werkhervatting.", "type": "outcome", "info": { "badges": ["#45"] } },
    "d3-out-47": { "id": "d3-out-47", "title": "47 Vrijlatingsregeling bijstand", "description": "Deel van inkomsten tijdelijk vrijgelaten in de bijstand.", "type": "outcome", "info": { "badges": ["#47"] } },
    "d3-out-48": { "id": "d3-out-48", "title": "48 Stimuleringspremie", "description": "Gemeentelijke premie bij uitstroom uit bijstand.", "type": "outcome", "info": { "badges": ["#48"] } },
    "d3-extra-zekerheid": { "id": "d3-extra-zekerheid", "title": "Extra zekerheid nodig?", "type": "question", "options": [ { "label": "Werk korte tijd → terugval bijstand", "next": "d3-out-49" }, { "label": "Werk korte tijd → terugval UWV‑uitkering", "next": "d3-out-50" }, { "label": "Wisselend inkomen → aangepaste verrekening (bijstand)", "next": "d3-out-51" }, { "label": "Opnieuw arbeidsongeschikt → herleving uitkering", "next": "d3-out-52" }, { "label": "Nee", "next": "d3-einde" } ], "info": { "badges": ["Deelkaart 3"] } },
    "d3-out-49": { "id": "d3-out-49", "title": "49 Terugvalregelingen bijstand", "description": "Terugkeer in bijstand bij einde/vermindering werk (korte duur).", "type": "outcome", "info": { "badges": ["#49"] } },
    "d3-out-50": { "id": "d3-out-50", "title": "50 Terugvalregelingen UWV‑uitkeringen", "description": "Terugkeer in uitkering (WW/WIA/ZW).", "type": "outcome", "info": { "badges": ["#50"] } },
    "d3-out-51": { "id": "d3-out-51", "title": "51 Aangepaste inkomensverrekening bijstand", "description": "Schommelingsbestendig verrekenen.", "type": "outcome", "info": { "badges": ["#51"] } },
    "d3-out-52": { "id": "d3-out-52", "title": "52 Herleving arbeidsongeschiktheidsuitkering", "description": "Heropening bij hernieuwde arbeidsongeschiktheid.", "type": "outcome", "info": { "badges": ["#52"] } },
    "d3-einde": { "id": "d3-einde", "title": "Einde Deelkaart 3", "description": "Geen extra regelingen geselecteerd.", "type": "outcome" }
  }
}

// FILE: /README.md
# Beslisboom → Quiz (Vite + Tailwind)

## Snel starten (Replit)
1. Open Replit → **Import from GitHub** of maak nieuw Node project.
2. Plak alle bestanden uit deze mapstructuur.
3. `npm i`
4. **Run** → startscript: `npm run dev` (poort 3000).
5. Dataset laden:
   - Kies in de dropdown **DK1+4** of **DK2+3**, of
   - Host een JSON en open `?data=URL`.

## Exports
- **TXT**: detailrapport met alle routes.
- **CSV**: 1 route per rij (Q1/A1/…/Outcome). Geschikt voor Excel.

## QA-tools
- **Valideer** (schema, bereikbaarheid, cycli).
- **QA‑routes**: lijst alle paden.
- **(Optioneel)**: Graphweergave kan eenvoudig worden toegevoegd (zie code commentaar).

## Dataset schema
Zie de **JSON schema** sectie in de app (open de app → scroll naar *Dataset info*).
