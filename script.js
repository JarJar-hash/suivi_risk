/*************************************************
 * PHASE 1 — Chargement CSV sans librairie
 *************************************************/

let raw_data = [];
let headers = [];

const files = [
    'data/suivi_du_risque_1.csv',
];

const riskFiles = files.filter(f => f.includes('suivi_du_risque'));

async function loadAllRiskCSVs() {
    for (const file of riskFiles) {
        try {
            const res = await fetch(file);
            const text = await res.text();
            parseAndAppendCSV(text);
        } catch (err) {
            console.error(`Erreur chargement CSV ${file}:`, err);
        }
    }

    console.log("RAW DATA:", raw_data);

    // Filtrer les données
    const filter_data = filterRawData(raw_data);

    // Construire et afficher la cascade
    renderCascade(filter_data);
}

/*************************************************
 * Parser CSV simple
 *************************************************/
function parseAndAppendCSV(csvText) {
    const lines = csvText.trim().split('\n');

    // 1. Récupérer en-tête une seule fois
    if (headers.length === 0) {
        headers = lines.shift().split(';').map(h => h.trim());
    } else {
        lines.shift(); // ignorer en-tête des autres fichiers
    }

    // 2. Parser lignes
    lines.forEach(line => {
        if (!line.trim()) return;

        const values = line.split(';').map(v => v.trim());
        raw_data.push(values);
    });
}

/*************************************************
 * PHASE 2 — Filtrage
 *************************************************/

/**
 * Divise deux nombres et retourne un résultat arrondi
 * @param {number} numerator - Numérateur
 * @param {number} denominator - Dénominateur
 * @param {number} decimals - Nombre de chiffres après la virgule
 * @returns {number} - Résultat de la division ou 0 si numérateur ou dénominateur est 0
 */

function safeDivide(numerator, denominator, decimals = 2) {
    if (!numerator || !denominator) return 0;
    const result = numerator / denominator;
    return parseFloat(result.toFixed(decimals));
}

function applyFilter() {
    
    filter_data = raw_data.filter(row => {
        const odd = parseFloat(row[7]);
        const ca = Number(parseFloat(row[8]));
        const ca_single = safeDivide(parseFloat(row[14]), 100);
        console.log("Filter Values", odd && " " && ca & " " & ca_single)
        return ca >= 1000 && odd >= 2;
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
            mkt: row[3],
            prono: row[4]
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
            <small>Market: ${e.mkt} | Prono: ${e.prono}</small>
        `;
        app.appendChild(card);
    });
}

/*************************************************
 * INIT
 *************************************************/
// --- Lancement ---
window.addEventListener('DOMContentLoaded', loadAllRiskCSVs);
