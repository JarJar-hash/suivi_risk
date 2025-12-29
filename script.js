/*************************************************
 * PHASE 1 — Chargement CSV sans librairie
 *************************************************/

let raw_data = [];
let headers = [];

const files = [
    'data/suivi_du_risque_1.csv',
];

const riskFiles = files.filter(f => f.includes('suivi_du_risque'));

let filter_data = [];
let structuredData = {};

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

    // Filtrage + cascade
    applyFilter();

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

/**
 * Supprime espaces + %
 * @param {any} content - Contenu variable
 * @returns {number} - Résultat de la transformation
 */

function CleanNumber(content) {
    return Number(content.toString().replace(",", ".").replace(" ", "").replace("%", ""))
}

function applyFilter() {
    
    filter_data = raw_data.filter(row => {
        const odd = CleanNumber(row[7]);
        const ca = CleanNumber(row[8]);
        const ca_single = safeDivide(CleanNumber(row[14]), 100);
        //console.log("Filter Values", odd, ca, ca_single);
        return ca >= 1000 && odd >= 2;
    });

    console.log("FILTER DATA:", filter_data);
    
    structuredData = buildStructure(filter_data);
    renderSports();
}

/*************************************************
 * PHASE 3 — Structuration cascade
 *************************************************/

function buildStructure(data) {
    const result = {};

    data.forEach(row => {
        const sport = row[1] || "Inconnu";
        const competition = row[2] || "Inconnu";
        const event = row[3] || "Inconnu";
        const mkt = row[4] || "Inconnu";
        const prono = row[5] || "Inconnu";

        // ignore si sport vide
        if (!sport) return ;

        if (!result[sport]) result[sport] = {};
        if (!result[sport][competition]) result[sport][competition] = {};
        if (!result[sport][competition][event]) result[sport][competition][event] = {};
        if (!result[sport][competition][event][mkt]) result[sport][competition][event][mkt] = [];

        result[sport][competition][event][mkt].push(prono);
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
        let count = Object.values(competitions).reduce((acc, comp) => {
            return acc + Object.values(comp).reduce((a, ev) => {
                return a + Object.values(ev).reduce((aa, mkts) => aa + mkts.length, 0);
            }, 0);
        }, 0);

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<h2>${sport}</h2><small>${count} événements</small>`;
        card.onclick = () => renderCompetitions(sport);
        app.appendChild(card);
    });
}

function renderCompetitions(sport) {
    app.innerHTML = `<div class="back" onclick="renderSports()">← Retour</div>`;

    Object.entries(structuredData[sport]).forEach(([competition, events]) => {
        let count = Object.values(events).reduce((acc, mkts) => {
            return acc + Object.values(mkts).reduce((a, mktArr) => a + mktArr.length, 0);
        }, 0);

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<h2>${competition}</h2><small>${count} événements</small>`;
        card.onclick = () => renderEvents(sport, competition);
        app.appendChild(card);
    });
}

function renderEvents(sport, competition) {
    app.innerHTML = `<div class="back" onclick="renderCompetitions('${sport}')">← Retour</div>`;

    Object.entries(structuredData[sport][competition]).forEach(([event, mkts]) => {
        let count = Object.values(mkts).reduce((a, pArr) => a + pArr.length, 0);
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<h2>${event}</h2><small>${count} markets</small>`;
        card.onclick = () => renderMarkets(sport, competition, event);
        app.appendChild(card);
    });
}

function renderMarkets(sport, competition, event) {
    app.innerHTML = `<div class="back" onclick="renderEvents('${sport}','${competition}')">← Retour</div>`;

    Object.entries(structuredData[sport][competition][event]).forEach(([mkt, pronos]) => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<h2>${mkt}</h2><small>${pronos.length} pronos</small>`;
        card.onclick = () => renderPronos(sport, competition, event, mkt);
        app.appendChild(card);
    });
}

function renderPronos(sport, competition, event, mkt) {
    app.innerHTML = `<div class="back" onclick="renderMarkets('${sport}','${competition}','${event}')">← Retour</div>`;

    structuredData[sport][competition][event][mkt].forEach(prono => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `<h2>${prono}</h2>`;
        app.appendChild(card);
    });
}

/*************************************************
 * INIT
 *************************************************/
// --- Lancement ---
window.addEventListener('DOMContentLoaded', loadAllRiskCSVs);
