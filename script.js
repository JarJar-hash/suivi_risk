/*************************************************
 * PHASE 1 — Chargement CSV sans librairie
 *************************************************/

let raw_data = [];
let headers = [];

const files = [
    'data/suivi_du_risque_1.csv',
];

const riskFiles = files.filter(f => f.includes('suivi_du_risque'));

let comp_data = [];

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

    // RETRAITEMENT DONNEES
    addCalculatedColumn(raw_data, 7)

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
 * PHASE 1 BIS — DONNEES CALCULEES
 *************************************************/

function addCalculatedColumn(raw_data, coteColIndex) {
    comp_data = []; // réinitialiser

    // 1. Regrouper par mkt_id (colonne 0)
    const mktGroups = {};
    raw_data.forEach(row => {
        const mktId = row[0];
        if (!mktGroups[mktId]) mktGroups[mktId] = [];
        mktGroups[mktId].push(row);
    });

    // 2. Calculer cote calculée pour chaque groupe
    Object.values(mktGroups).forEach(group => {
        const cotes = group.map(r => CleanNumber(r[coteColIndex]));

        let coteCalc;
        if (group.length === 3) {
            coteCalc = Math.max(...cotes);
        } else if (group.length === 4) {
            coteCalc = Math.max(cotes[1], cotes[3]);
        } else {
            coteCalc = median(cotes);
        }

        // 3. Ajouter la cote calculée à chaque ligne
        group.forEach(r => {
            comp_data.push([...r, coteCalc]);
        });
    });

    console.log("COMP_DATA:", comp_data);
}

// Fonction utilitaire pour médiane
function median(arr) {
    const sorted = arr.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
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
    
    filter_data = comp_data.filter(row => {
        const sport = row[1];
        const odd = CleanNumber(row[7]);
        const odd_ratio = safeDivide(row[24], odd);
        const ca = CleanNumber(row[8]);
        const ca_single = safeDivide(CleanNumber(row[14]), 100);
        
        //console.log("Filter Values", odd, ca, ca_single);
        
        return sport && ca >= 1000 && odd >= 2 && odd_ratio >= 1.2 ;
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

function computeStats(rows) {
    let totalCA = 0;
    let sumConcCA = 0;
    let sumConcSingle = 0;

    rows.forEach(r => {
        const ca = CleanNumber(r[8]);
        const conc = CleanNumber(r[9]);
        const concSingle = CleanNumber(r[14]);

        totalCA += ca;
        sumConcCA += conc;
        sumConcSingle += concSingle;
    });

    const count = rows.length;

    return {
        totalCA: Math.round(totalCA),
        concentrationCA: count ? (sumConcCA / count).toFixed(2) : 0,
        concentrationSingle: count ? (sumConcSingle / count).toFixed(2) : 0
    };
}


function renderSports() {
    app.innerHTML = '';
    Object.entries(structuredData).forEach(([sport, competitions]) => {

        const rows = filter_data.filter(r => r[1] === sport);
        const stats = computeStats(rows);
        
        let count = Object.keys(competitions).length;
        
        const card = document.createElement('div');
        card.className = 'card';
        
        const label = count === 1 ? 'compétition' : 'compétitions';

        card.innerHTML = `
            <h2>${sport}</h2>
        
            <div class="card-count">
                ${count} ${label}
            </div>
        
            <div class="card-stats">
                CA : ${stats.totalCA} €<br>
                % CA : ${stats.concentrationCA}<br>
                % CA Single : ${stats.concentrationSingle}
            </div>
        `;

        card.onclick = () => renderCompetitions(sport);
        app.appendChild(card);
    });
}

function renderCompetitions(sport) {
    app.innerHTML = `<div class="back" onclick="renderSports()">← Retour</div>`;

    Object.entries(structuredData[sport]).forEach(([competition, events]) => {

        const rows = filter_data.filter(r => 
            r[1] === sport &&
            r[2] == competition
        );
        const stats = computeStats(rows);
        
        let count = Object.keys(events).length;

        const card = document.createElement('div');
        card.className = 'card';

        const label = count === 1 ? 'événement' : 'événements';
        
        card.innerHTML = `
            <h2>${competition}</h2>
        
            <div class="card-count">
                ${count} ${label}
            </div>
        
            <div class="card-stats">
                CA : ${stats.totalCA} €<br>
                % CA : ${stats.concentrationCA} %<br>
                % CA Single : ${stats.concentrationSingle} %
            </div>
        `;

        card.onclick = () => renderEvents(sport, competition);
        app.appendChild(card);
    });
}

function renderEvents(sport, competition) {
    app.innerHTML = `<div class="back" onclick="renderCompetitions('${sport}')">← Retour</div>`;

    Object.entries(structuredData[sport][competition]).forEach(([event, mkts]) => {

        const rows = filter_data.filter(r => 
            r[1] === sport &&
            r[2] == competition &&
            r[3] == event
        );
        const stats = computeStats(rows);
        
        let count = Object.keys(mkts).length;
        const card = document.createElement('div');
        card.className = 'card';

        const label = count === 1 ? 'market' : 'markets';

        card.innerHTML = `
            <h2>${event}</h2>
        
            <div class="card-count">
                ${count} ${label}
            </div>
        
            <div class="card-stats">
                CA : ${stats.totalCA} €<br>
                % CA : ${stats.concentrationCA} %<br>
                % CA Single : ${stats.concentrationSingle} %
            </div>
        `;

        card.onclick = () => renderMarkets(sport, competition, event);
        app.appendChild(card);
    });
}

function renderMarkets(sport, competition, event) {
    app.innerHTML = `<div class="back" onclick="renderEvents('${sport}','${competition}')">← Retour</div>`;

    Object.entries(structuredData[sport][competition][event]).forEach(([mkt, pronos]) => {

        const rows = filter_data.filter(r => 
            r[1] === sport &&
            r[2] == competition &&
            r[3] == event &&
            r[4] == mkt
        );
        const stats = computeStats(rows);

        let count = Object.keys(pronos).length;
        
        const card = document.createElement('div');
        card.className = 'card';

        const label = count === 1 ? 'prono' : 'pronos';

        card.innerHTML = `
            <h2>${mkt}</h2>
        
            <div class="card-count">
                ${count} ${label}
            </div>
        
            <div class="card-stats">
                CA : ${stats.totalCA} €<br>
                % CA : ${stats.concentrationCA} %<br>
                % CA Single : ${stats.concentrationSingle} %
            </div>
        `;

        card.onclick = () => renderPronos(sport, competition, event, mkt);
        app.appendChild(card);
    });
}

function renderPronos(sport, competition, event, mkt) {
    app.innerHTML = `<div class="back" onclick="renderMarkets('${sport}','${competition}','${event}')">← Retour</div>`;

    structuredData[sport][competition][event][mkt].forEach(prono => {

        const rows = filter_data.filter(r => 
            r[1] === sport &&
            r[2] == competition &&
            r[3] == event &&
            r[4] == mkt &&
            r[5] == prono
        );
        const stats = computeStats(rows);
        
        const card = document.createElement('div');
        card.className = 'card';

        card.innerHTML = `
            <h2>${prono}</h2>
            
            <div class="card-stats">
                CA : ${stats.totalCA} €<br>
                % CA : ${stats.concentrationCA} %<br>
                % CA Single : ${stats.concentrationSingle} %
            </div>
        `;
        
        app.appendChild(card);
    });
}

/*************************************************
 * INIT
 *************************************************/
// --- Lancement ---
window.addEventListener('DOMContentLoaded', loadAllRiskCSVs);
