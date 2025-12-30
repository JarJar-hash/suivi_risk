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
    autoDrillDown();


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

// Gestion navigation header
document.querySelectorAll('.ps-header-nav a').forEach(link => {
    link.addEventListener('click', e => {
        e.preventDefault();

        const view = link.dataset.view;

        document
            .querySelectorAll('.ps-header-nav a')
            .forEach(a => a.classList.remove('active'));

        link.classList.add('active');

        if (view === 'cards') {
            cardsView.style.display = 'block';
            risksView.style.display = 'none';
            renderSports();
        }

        if (view === 'risks') {
            cardsView.style.display = 'none';
            risksView.style.display = 'block';
            renderRisksTable();
        }
    });
});

/*************************************************
 * Vue Tableau
 *************************************************/

// LOGIQUE DE TRI

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

const riskColumns = [
    { key: 'riskIntegrity', label: 'Risque Integrite' },
    { key: 'sport', label: 'Sport' },
    { key: 'competition', label: 'Competition' },
    { key: 'event', label: 'Event' },
    { key: 'market', label: 'Market' },
    { key: 'prono', label: 'Prono' },
    { key: 'ca', label: 'CA (€)' },
    { key: 'cote', label: 'Cote' },
    { key: 'conc', label: '% CA' },
    { key: 'concSingle', label: '% Single' }
];

// LOGIQUE DE FILTRE

function debounce(func, delay = 600) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), delay);
    };
}

let columnFilters = {
    riskIntegrity: { op: '>=', value: '' },
    sport: '',
    competition: '',
    event: '',
    market: '',
    prono: '',
    ca: { op: '>=', value: '' },
    cote: { op: '>=', value: '' },
    conc: { op: '>=', value: '' },
    concSingle: { op: '>=', value: '' },
};

function applyColumnFilters(rows) {
    return rows.filter(r => {
        // Filtres textuels
        for (const key of ['sport', 'competition', 'event', 'market', 'prono']) {
            const val = columnFilters[key].trim().toLowerCase();
            if (val && !r[key].toLowerCase().includes(val)) return false;
        }
        // Filtres numériques
        for (const key of ['riskIntegrity', 'ca', 'cote', 'conc', 'concSingle']) {
            const { op, value } = columnFilters[key];
            if (value !== '') {
                const numValue = parseFloat(value);
                if (op === '>=' && r[key] < numValue) return false;
                if (op === '<=' && r[key] > numValue) return false;
            }
        }
        return true;
    });
}

const debouncedRender = debounce(renderRisksTable, delay = 600);

function updateFilter(key, value) { columnFilters[key] = value; debouncedRender(); }
function updateFilterOperator(key, op) { columnFilters[key].op = op; debouncedRender(); }
function updateFilterValue(key, value) { columnFilters[key].value = value; debouncedRender(); }

function renderTableHeader() {
    return `
    <thead>
        <tr>
            ${riskColumns.map(col => {
                const idx = riskSort.findIndex(s => s.key === col.key);
                const active = idx !== -1;
                const arrow = active ? (riskSort[idx].direction === 'asc' ? '▲' : '▼') : '';
                const order = active && riskSort.length > 1 ? `<sup>${idx + 1}</sup>` : '';

                return `
                    <th class="sortable ${active ? 'active' : ''}">
                        <div class="col-title"
                             onclick="setRiskSort('${col.key}', event)">
                            ${col.label} ${arrow} ${order}
                        </div>
                        <div class="col-filter">
                            ${renderFilterInput(col.key)}
                        </div>
                    </th>
                `;
            }).join('')}
        </tr>
    </thead>`;
}

// Génère l'input de filtre selon le type de colonne
function renderFilterInput(key) {
    if (['sport','competition','event','market','prono'].includes(key)) {
        return `
            <input type="text"
                   class="filter-input"
                   placeholder="Filtrer..."
                   value="${columnFilters[key]}"
                   oninput="updateFilter('${key}', this.value)">
        `;
    }

    return `
        <div class="filter-numeric">
            <input type="number"
                   class="filter-input"
                   placeholder="Valeur"
                   value="${columnFilters[key].value}"
                   oninput="updateFilterValue('${key}', this.value)">

            <select class="filter-op"
                    onchange="updateFilterOperator('${key}', this.value)">
                <option value=">=" ${columnFilters[key].op === '>=' ? 'selected':''}>&ge;</option>
                <option value="<=" ${columnFilters[key].op === '<=' ? 'selected':''}>&le;</option>
            </select>
        </div>
    `;
}

let riskLimit = 10;

function setRiskLimit(value) {
    riskLimit = Number(value);
    renderRisksTable();
}

function renderRisksTable() {
    
    risksView.innerHTML = '';
    const table = document.createElement('table');
    table.className = 'risk-table';

    // Transformation des données
    let rows = filter_data.map(row => ({
        riskIntegrity: CleanNumber(CleanNumber(row[14]) / 10, decimals = 1),
        sport: row[1],
        competition: row[2],
        event: row[3],
        market: row[4],
        prono: row[5],
        cote: CleanNumber(row[7]),
        ca: CleanNumber(row[8]),
        conc: CleanNumber(row[9]),
        concSingle: CleanNumber(row[14])
    }));

    // Appliquer filtres
    rows = applyColumnFilters(rows);

    // Trier
    rows = sortRisks(rows);

    const total = rows.length;
    if (riskLimit > 0) rows = rows.slice(0, riskLimit);

    // Top N
    const limits = [5,10,15,30].filter(v => v < total);
    const controlsTopHtml = `
        <div class="risk-controls">
            <label>
                Top
                <select onchange="setRiskLimit(this.value)">
                    <option value="0" ${riskLimit===0?'selected':''}>Tous</option>
                    ${limits.map(v => `<option value="${v}" ${riskLimit===v?'selected':''}>${v}</option>`).join('')}
                    <option value="${total}" ${riskLimit===total?'selected':''}>${total}</option>
                </select>
                risques
            </label>
        </div>
    `;

    risksView.innerHTML = controlsTopHtml;

    // ===== TABLE =====

    table.innerHTML = `
        ${renderTableHeader()}
        <tbody>
            ${rows.map(r => `
                <tr>
                    <td style="background:${heatColor(r.riskIntegrity * 10, 0, 10)}; text-align:center; font-weight:bold; color:white">
                        ${r.riskIntegrity.toFixed(1)}
                    </td>
                    <td>${r.sport}</td>
                    <td>${r.competition}</td>
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

function autoDrillDown() {
    const sports = Object.keys(structuredData);

    if (sports.length === 1) {
        const sport = sports[0];
        const competitions = Object.keys(structuredData[sport].children);

        if (competitions.length === 1) {
            const comp = competitions[0];
            const events = Object.keys(structuredData[sport].children[comp].children);

            if (events.length === 1) {
                const evt = events[0];
                const markets = Object.keys(structuredData[sport].children[comp].children[evt].children);

                if (markets.length === 1) {
                    const mkt = markets[0];
                    renderPronos(sport, comp, evt, mkt);

                }

                renderMarkets(sport, comp, evt);
                return;
            }

            renderEvents(sport, comp);
            return;
        }

        renderCompetitions(sport);
        return;
    }

    renderSports();
}

/*************************************************
 * INIT
 *************************************************/
window.addEventListener('DOMContentLoaded', loadAllRiskCSVs);
