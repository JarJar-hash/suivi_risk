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

    //LOAD RAW DATA
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

    // Filtrage
    applyFilter();

    // Structure + Stats
    buildStructuredData();
    renderSports();

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
}

/*************************************************
 * PHASE 3 — Structuration cascade
 *************************************************/

// NEW VERSION

function buildStructuredData() {
    structuredData = {};

    // Organiser les lignes par sport/comp/event/mkt/prono
    filter_data.forEach(row => {
        const sport = row[1];
        const competition = row[2];
        const event = row[3];
        const mkt = row[4];
        const prono = row[5];
        const cote = row[7];
        const ca = CleanNumber(row[8]);
        const conc = CleanNumber(row[9]);
        const ca_single = CleanNumber(row[14]);

        if (!structuredData[sport]) structuredData[sport] = {rows: [], children:{}};
        const sportNode = structuredData[sport];
        sportNode.rows.push({ca, conc, ca_single, cote});

        if (!sportNode.children[competition]) sportNode.children[competition] = {rows: [], children:{}};
        const compNode = sportNode.children[competition];
        compNode.rows.push({ca, conc, ca_single, cote});

        if (!compNode.children[event]) compNode.children[event] = {rows: [], children:{}};
        const eventNode = compNode.children[event];
        eventNode.rows.push({ca, conc, ca_single, cote});

        if (!eventNode.children[mkt]) eventNode.children[mkt] = {rows: [], children:{}};
        const mktNode = eventNode.children[mkt];
        mktNode.rows.push({ca, conc, ca_single, cote});

        if (!mktNode.children[prono]) mktNode.children[prono] = {rows: [], children:{}};
        const pronoNode = mktNode.children[prono];
        pronoNode.rows.push({ca, conc, ca_single, cote});
    });

    // Calculer les stats pour chaque node
    function computeNodeStats(node, totalParentCA = null) {
        const totalCA = node.rows.reduce((sum,r) => sum+r.ca,0);
        const count = node.rows.length;
        const concentrationCA = count ? (node.rows.reduce((sum,r)=>sum+r.conc,0)/count) : 0;
        const concentrationSingle = count ? (node.rows.reduce((sum,r)=>sum+r.ca_single,0)/count) : 0;
        const caPercent = totalParentCA ? (totalCA/totalParentCA)*100 : 100;

        node.stats = {totalCA, concentrationCA, concentrationSingle, caPercent};

        // Appliquer récursivement
        Object.values(node.children).forEach(child => computeNodeStats(child, totalCA));
    }

    Object.values(structuredData).forEach(sportNode => computeNodeStats(sportNode));
}

/*************************************************
 * PHASE 4 — UI Cascade
 *************************************************/
const app = document.getElementById('app');

function heatColor(value, min = 0, max = 100) { // ajusté selon %CA
    const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
    const hue = 0 + (120 * (1 - ratio)); // 0 = rouge, 120 = vert
    return `hsl(${hue}, 90%, ${50 - ratio*20}%)`;
}

function renderNode(title, node, level, parentOnClick = null, childOnClick = null, isProno = false) {
    
    const card = document.createElement('div');
    card.className = 'card';
    const heat = heatColor(node.stats.concentrationSingle);

    card.style.borderLeft = `8px solid ${heat}`;
    card.style.background = `linear-gradient(135deg, rgba(255,255,255,1), ${heat}15)`;

    // Déterminer le label selon le niveau
    let count, label;
    if (isProno) {
        count = 1; 
        label = 'prono';
    } else {
        count = node.children ? Object.keys(node.children).length : node.rows.length;
        if (level === 'sport') label = count === 1 ? 'compétition' : 'compétitions';
        else if (level === 'competition') label = count === 1 ? 'événement' : 'événements';
        else if (level === 'event') label = count === 1 ? 'market' : 'markets';
        else if (level === 'market') label = count === 1 ? 'prono' : 'pronos';
    }

    // Stats HTML
    let statHtml = `
        <div class="card-stats">
            <div class="stat-main">
                CA <span>${Math.round(node.stats.totalCA)} €</span>
                ${isProno ? ` | Cote: ${node.rows[0].cote}` : ''}
            </div>
            <div class="stat-row">
                % CA: ${node.stats.concentrationCA.toFixed(0)} | % Single: ${node.stats.concentrationSingle.toFixed(0)}
                ${!isProno ? `<br>${count} ${label}` : ''}
            </div>
        </div>
        <div class="ca-bar">
            <div class="ca-bar-fill" style="width:${node.stats.caPercent}%; background:${heat}"></div>
        </div>
    `;

    card.innerHTML = `<h2>${title}</h2>${statHtml}`;

    // Si clic parent, exécute-le
    if (parentOnClick) card.onclick = parentOnClick;
    else if (childOnClick) card.onclick = childOnClick;

    app.appendChild(card);
}

/*************************************************
 * RENDER — Fonctions pour tous les niveaux
 *************************************************/

// Render sports (niveau racine)
function renderSports() {
    app.innerHTML = '';
    Object.entries(structuredData).forEach(([sport, sportNode]) => {
        renderNode(sport, sportNode, 0, null, () => renderCompetitions(sport));
    });
}

// Render compétitions pour un sport
function renderCompetitions(sport) {
    const sportNode = structuredData[sport];
    app.innerHTML = `<div class="back" onclick="renderSports()">← Retour</div>`;
    Object.entries(sportNode.children).forEach(([competition, compNode]) => {
        renderNode(competition, compNode, 1, null, () => renderEvents(sport, competition));
    });
}

// Render événements pour une compétition
function renderEvents(sport, competition) {
    const compNode = structuredData[sport].children[competition];
    app.innerHTML = `<div class="back" onclick="renderCompetitions('${sport}')">← Retour</div>`;
    Object.entries(compNode.children).forEach(([event, eventNode]) => {
        renderNode(event, eventNode, 2, null, () => renderMarkets(sport, competition, event));
    });
}

// Render markets pour un événement
function renderMarkets(sport, competition, event) {
    const eventNode = structuredData[sport].children[competition].children[event];
    app.innerHTML = `<div class="back" onclick="renderEvents('${sport}','${competition}')">← Retour</div>`;
    Object.entries(eventNode.children).forEach(([mkt, mktNode]) => {
        renderNode(mkt, mktNode, 3, null, () => renderPronos(sport, competition, event, mkt));
    });
}

// Render pronos pour un market
function renderPronos(sport, competition, event, mkt) {
    const mktNode = structuredData[sport].children[competition].children[event].children[mkt];
    app.innerHTML = `<div class="back" onclick="renderMarkets('${sport}','${competition}','${event}')">← Retour</div>`;
    Object.entries(mktNode.children).forEach(([prono, pronoNode]) => {
        renderNode(prono, pronoNode, 4, null, null, true);
    });
}

/*************************************************
 * INIT
 *************************************************/
window.addEventListener('DOMContentLoaded', loadAllRiskCSVs);
