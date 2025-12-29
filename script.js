/*************************************************
 * PHASE 1 — Chargement Excel
 *************************************************/
let raw_data = [];
let filter_data = [];
let structuredData = {};

const files = [
    'data/suivi_du_risque_football.xlsx',
    'data/suivi_du_risque_basket.xlsx'
];

async function loadExcelFiles() {
    for (const file of files) {
        if (!file.includes('suivi_du_risque')) continue;

        const res = await fetch(file);
        const buffer = await res.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        rows.shift(); // supprimer en-tête

        raw_data.push(...rows);
    }

    applyFilter();
}

/*************************************************
 * PHASE 2 — Filtrage
 *************************************************/
function applyFilter() {
    filter_data = raw_data.filter(row => {
        const col10 = Number(row[9]);
        const col5 = Number(row[4]);
        return col10 > 100 && col5 > 2;
    });

    structuredData = buildStructure(filter_data);
    renderSports();
}

/*************************************************
 * PHASE 3 — Structuration cascade
 *************************************************/
function buildStructure(data) {
    const result = {};

    data.forEach(row => {
        const sport = row[0];
        const competition = row[1];

        if (!result[sport]) result[sport] = {};
        if (!result[sport][competition]) result[sport][competition] = [];

        result[sport][competition].push({
            event: row[2],
            value10: row[9],
            value5: row[4]
        });
    });

    return result;
}

/*************************************************
 * PHASE 4 — UI Cascade
 *************************************************/
const app = document.getElementById('app');

function renderSports() {
    app.innerHTML = '';

    Object.entries(structuredData).forEach(([sport, competitions]) => {
        let count = 0;
        Object.values(competitions).forEach(c => count += c.length);

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h2>${sport}</h2>
            <small>${count} événements</small>
        `;

        card.onclick = () => renderCompetitions(sport);
        app.appendChild(card);
    });
}

function renderCompetitions(sport) {
    app.innerHTML = `<div class="back" onclick="renderSports()">← Retour</div>`;

    Object.entries(structuredData[sport]).forEach(([competition, events]) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h2>${competition}</h2>
            <small>${events.length} événements</small>
        `;

        card.onclick = () => renderEvents(sport, competition);
        app.appendChild(card);
    });
}

function renderEvents(sport, competition) {
    app.innerHTML = `
        <div class="back" onclick="renderCompetitions('${sport}')">← Retour</div>
    `;

    structuredData[sport][competition].forEach(e => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <h2>${e.event}</h2>
            <small>Col10: ${e.value10} | Col5: ${e.value5}</small>
        `;
        app.appendChild(card);
    });
}

/*************************************************
 * INIT
 *************************************************/
loadExcelFiles();
