/*************************************************
 * Fonction principale
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
 * DONNEES CALCULEES - RAW_DATA to COMP_DATA
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
 * Filtrage
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
        
        return sport && ca >= 1000 && odd >= 1.6 && odd_ratio >= 0.8 ;
    });

    console.log("FILTER DATA:", filter_data);
}

/*************************************************
 * Gestion des vues
 *************************************************/

const cardsView = document.getElementById('cardsView');
const risksView = document.getElementById('risksView');

function showView(view) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));

    if (view === 'cards') {
        cardsView.style.display = 'block';
        risksView.style.display = 'none';
        document.querySelector('.tab:nth-child(1)').classList.add('active');
        renderSports();
    } else {
        cardsView.style.display = 'none';
        risksView.style.display = 'block';
        document.querySelector('.tab:nth-child(2)').classList.add('active');
        renderRisksTable();
    }
}

/*************************************************
 * Vue Tableau
 *************************************************/

let riskSort = [
    { key: 'ca', direction: 'desc' } // tri par défaut
];

function setRiskSort(key, event) {
    const isShift = event.shiftKey;
    const existing = riskSort.find(s => s.key === key);

    if (!isShift) {
        // Reset tri
        if (existing) {
            existing.direction = existing.direction === 'asc' ? 'desc' : 'asc';
            riskSort = [existing];
        } else {
            riskSort = [{ key, direction: 'desc' }];
        }
    } else {
        // Multi-tri
        if (existing) {
            existing.direction = existing.direction === 'asc' ? 'desc' : 'asc';
        } else {
            riskSort.push({ key, direction: 'desc' });
        }
    }

    renderRisksTable();
}

function sortRisks(rows) {
    return rows.sort((a, b) => {
        for (const { key, direction } of riskSort) {
            let v1 = a[key];
            let v2 = b[key];

            if (typeof v1 === 'string') {
                const res = v1.localeCompare(v2);
                if (res !== 0) return direction === 'asc' ? res : -res;
            } else {
                if (v1 !== v2) {
                    return direction === 'asc' ? v1 - v2 : v2 - v1;
                }
            }
        }
        return 0;
    });
}

function renderTableHeader() {
    return `
    <thead>
        <tr>
            ${riskColumns.map(col => {
                const idx = riskSort.findIndex(s => s.key === col.key);
                const active = idx !== -1;
                const arrow = active
                    ? (riskSort[idx].direction === 'asc' ? '▲' : '▼')
                    : '';
                const order = active && riskSort.length > 1 ? `<sup>${idx + 1}</sup>` : '';

                return `
                    <th class="sortable ${active ? 'active' : ''}"
                        onclick="setRiskSort('${col.key}', event)">
                        ${col.label} ${arrow} ${order}
                    </th>
                `;
            }).join('')}
        </tr>
    </thead>`;
}

let riskLimit = 20;

function setRiskLimit(value) {
    riskLimit = Number(value);
    renderRisksTable();
}

function renderRisksTable() {
    risksView.innerHTML = '';

    let rows = filter_data.map(row => ({
        sport: row[1],
        event: row[3],
        market: row[4],
        prono: row[5],
        cote: CleanNumber(row[7]),
        ca: CleanNumber(row[8]),
        conc: CleanNumber(row[9]),
        concSingle: CleanNumber(row[14])
    }));

    rows = sortRisks(rows);

    if (riskLimit > 0) {
        rows = rows.slice(0, riskLimit);
    }

    const table = document.createElement('table');
    table.className = 'risk-table';

    const controls = `
    <div class="risk-controls">
        <label>
            Top
            <select onchange="setRiskLimit(this.value)">
                <option value="0">Tous</option>
                <option value="10">10</option>
                <option value="20" selected>20</option>
                <option value="50">50</option>
                <option value="100">100</option>
            </select>
            risks
        </label>
    </div>
    `;

    table.innerHTML = `
        ${controls}
        ${renderTableHeader()}
        <tbody>
            ${rows.map(r => `
                <tr style="border-left:6px solid ${heatColor(r.concSingle)}">
                    <td>${r.sport}</td>
                    <td>${r.event}</td>
                    <td>${r.market}</td>
                    <td><strong>${r.prono}</strong></td>
                    <td>${Math.round(r.ca)}</td>
                    <td>${r.cote}</td>
                    <td>${r.conc.toFixed(0)}%</td>
                    <td>${r.concSingle.toFixed(0)}%</td>
                </tr>
            `).join('')}
        </tbody>
    `;

    risksView.appendChild(table);
}


/*************************************************
 * Vue cascade - Structuration
 *************************************************/

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
 * UI Cascade
 *************************************************/

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

    let count, label;
    const levelLabels = {
        0: ['compétition', 'compétitions'],
        1: ['événement', 'événements'],
        2: ['market', 'markets'],
        3: ['prono', 'pronos'],
    };

    if (isProno) {
        count = 1;
        label = 'prono';
    } else {
        count = Object.keys(node.children || {}).length;
        if (levelLabels[level]) {
            label = count === 1
                ? levelLabels[level][0]
                : levelLabels[level][1];
        }
    }

    // Stats HTML
    let statHtml = `
        <div class="card-stats">
            <div class="stat-main">
                <span>${Math.round(node.stats.totalCA)} €</span>
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

    cardsView.appendChild(card);
}

/*************************************************
 * UI - Each Level
 *************************************************/

// Render sports (niveau racine)
function renderSports() {
    cardsView.innerHTML = '';
    Object.entries(structuredData).forEach(([sport, sportNode]) => {
        renderNode(sport, sportNode, 0, null, () => renderCompetitions(sport));
    });
}

// Render compétitions pour un sport
function renderCompetitions(sport) {
    const sportNode = structuredData[sport];
    cardsView.innerHTML = `<div class="back" onclick="renderSports()">← Retour</div>`;
    Object.entries(sportNode.children).forEach(([competition, compNode]) => {
        renderNode(competition, compNode, 1, null, () => renderEvents(sport, competition));
    });
}

// Render événements pour une compétition
function renderEvents(sport, competition) {
    const compNode = structuredData[sport].children[competition];
    cardsView.innerHTML = `<div class="back" onclick="renderCompetitions('${sport}')">← Retour</div>`;
    Object.entries(compNode.children).forEach(([event, eventNode]) => {
        renderNode(event, eventNode, 2, null, () => renderMarkets(sport, competition, event));
    });
}

// Render markets pour un événement
function renderMarkets(sport, competition, event) {
    const eventNode = structuredData[sport].children[competition].children[event];
    cardsView.innerHTML = `<div class="back" onclick="renderEvents('${sport}','${competition}')">← Retour</div>`;
    Object.entries(eventNode.children).forEach(([mkt, mktNode]) => {
        renderNode(mkt, mktNode, 3, null, () => renderPronos(sport, competition, event, mkt));
    });
}

// Render pronos pour un market
function renderPronos(sport, competition, event, mkt) {
    const mktNode = structuredData[sport].children[competition].children[event].children[mkt];
    cardsView.innerHTML = `<div class="back" onclick="renderMarkets('${sport}','${competition}','${event}')">← Retour</div>`;
    Object.entries(mktNode.children).forEach(([prono, pronoNode]) => {
        renderNode(prono, pronoNode, 4, null, null, true);
    });
}

/*************************************************
 * INIT
 *************************************************/
window.addEventListener('DOMContentLoaded', loadAllRiskCSVs);
