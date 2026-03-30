const drugSearchInput = document.getElementById('drug-search');
const drugList = document.getElementById('drug-list');
const selectedListContainer = document.getElementById('selected-list');
const addBtn = document.getElementById('add-btn');
const checkBtn = document.getElementById('check-btn');
const resultsArea = document.getElementById('results-area');
const tabsContainer = document.getElementById('tabs-container');
const resultsContainer = document.getElementById('results-container');

// Map result codes to readable text and CSS classes
const resultMapping = {
    'C': { text: 'Compatible', class: 'comp-c' },
    'I': { text: 'Incompatible', class: 'comp-i' },
    'U': { text: 'Uncertain', class: 'comp-u' },
    '?': { text: 'Unknown', class: 'comp-u' },
    'V': { text: 'Variable', class: 'comp-u' },
    'VI': { text: 'Variable (Has Incompatibility)', class: 'comp-vi' }
};

// Application State
let allDrugOptions = [];
let selectedItems = new Set();
let drugSet = new Set();

// Initialize
(async () => {
    try {
        await fetchAllOptions();
        console.log('Data loaded successfully');
    } catch (err) {
        console.error('Failed to load initial data:', err);
        alert('Failed to load drug database. Please try reloading the page.');
    }
})();

// Fetch Combined List
async function fetchAllOptions() {
    try {
        const [drugsRes, secondRes] = await Promise.all([
            fetch('/api/drugs'),
            fetch('/api/second-component')
        ]);

        if (!drugsRes.ok || !secondRes.ok) throw new Error('Failed to fetch data');

        const drugs = await drugsRes.json();
        const seconds = await secondRes.json();

        // Combine and unique
        const combined = new Set([...drugs, ...seconds]);
        allDrugOptions = Array.from(combined).sort();
        drugSet = new Set(allDrugOptions);

        populateDataList(drugList, allDrugOptions);
    } catch (err) {
        console.error(err);
    }
}

function populateDataList(datalist, options) {
    datalist.innerHTML = '';
    const fragment = document.createDocumentFragment();
    options.forEach(option => {
        const op = document.createElement('option');
        op.value = option;
        fragment.appendChild(op);
    });
    datalist.appendChild(fragment);
}

function addItem() {
    const val = drugSearchInput.value.trim();
    if (!val) return;

    if (selectedItems.has(val)) {
        drugSearchInput.value = '';
        return;
    }

    selectedItems.add(val);
    renderSelectedItems();
    drugSearchInput.value = '';
    drugSearchInput.focus();
}

addBtn.addEventListener('click', addItem);
drugSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        addItem();
    }
});

function renderSelectedItems() {
    selectedListContainer.innerHTML = '';
    if (selectedItems.size === 0) {
        selectedListContainer.innerHTML = '<span class="empty-state">No drugs selected</span>';
        checkBtn.textContent = 'Check Compatibility';
        checkBtn.disabled = true;
        return;
    }

    selectedItems.forEach(item => {
        const tag = document.createElement('div');
        tag.className = 'drug-tag';
        tag.innerHTML = `
            <span>${escapeHtml(item)}</span>
            <button class="remove-tag" onclick="removeItem('${escapeHtml(item)}')">&times;</button>
        `;
        selectedListContainer.appendChild(tag);
    });

    if (selectedItems.size === 1) {
        const drugName = Array.from(selectedItems)[0];
        checkBtn.textContent = `Find Incompatibilities for ${drugName}`;
        checkBtn.disabled = false;
    } else {
        checkBtn.textContent = 'Check Compatibility';
        checkBtn.disabled = false;
    }
}

// Expose removal to window
window.removeItem = (item) => {
    // handled by delegation below, but available globally if needed
};

selectedListContainer.addEventListener('click', (e) => {
    if (e.target.classList.contains('remove-tag')) {
        const span = e.target.previousElementSibling;
        const val = span.textContent;
        selectedItems.delete(val);
        renderSelectedItems();
    }
});


checkBtn.addEventListener('click', async () => {
    if (selectedItems.size === 0) return;

    checkBtn.disabled = true;
    const originalText = checkBtn.textContent;
    checkBtn.textContent = 'Checking...';
    resultsArea.classList.add('hidden');

    // Clear previous results
    tabsContainer.innerHTML = '';
    resultsContainer.innerHTML = '';

    try {
        if (selectedItems.size === 1) {
            const drug = Array.from(selectedItems)[0];
            const response = await fetch(`/api/find-incompatible?drug=${encodeURIComponent(drug)}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const results = await response.json();
            renderResultsWithTabs(results, drug);
        } else {
            const response = await fetch('/api/check-multi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ drugs: Array.from(selectedItems) })
            });
            if (!response.ok) throw new Error('Network response was not ok');
            const results = await response.json();
            renderResultsWithTabs(results, null);
        }
    } catch (err) {
        console.error('Error:', err);
        resultsContainer.innerHTML = '<p class="error">An error occurred. Please try again.</p>';
        resultsArea.classList.remove('hidden');
    } finally {
        checkBtn.textContent = originalText;
        checkBtn.disabled = false;
    }
});

function sanitizeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '-');
}

function renderResultsWithTabs(results, targetDrug) {
    if (results.length === 0) {
        resultsContainer.innerHTML = targetDrug
            ? `<p>No incompatibilities found for <strong>${escapeHtml(targetDrug)}</strong>.</p>`
            : '<p>No interactions found between the selected items.</p>';
        resultsArea.classList.remove('hidden');
        return;
    }

    // Partition results by Type
    const partitions = {
        'Y-Site': [],
        'Admixture': [],
        'Syringe': [],
        'Solution': [],
        'TPN/TNA': [],
        'Other': []
    };

    results.forEach(item => {
        let added = false;
        if (item.is_ysite) { partitions['Y-Site'].push(item); added = true; }
        if (item.is_admix) { partitions['Admixture'].push(item); added = true; }
        if (item.is_syringe) { partitions['Syringe'].push(item); added = true; }
        if (item.is_solution) { partitions['Solution'].push(item); added = true; }
        if (item.is_tpntna) { partitions['TPN/TNA'].push(item); added = true; }

        if (!added) partitions['Other'].push(item);
    });

    let firstTab = true;
    const typeOrder = ['Y-Site', 'Admixture', 'Syringe', 'Solution', 'TPN/TNA', 'Other'];

    typeOrder.forEach(type => {
        const items = partitions[type];
        if (items.length === 0) return;

        const safeId = sanitizeId(type);

        // Create Tab Button
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn ${firstTab ? 'active' : ''}`;
        tabBtn.dataset.tab = safeId;
        tabBtn.textContent = `${type} (${items.length})`;

        // Use addEventListener for better reliability
        tabBtn.addEventListener('click', function () {
            window.switchTab(safeId);
        });

        tabsContainer.appendChild(tabBtn);

        // Create Content Div
        const contentDiv = document.createElement('div');
        contentDiv.id = `tab-${safeId}`;
        contentDiv.className = `tab-content results-grid ${firstTab ? 'active' : ''}`; // Added results-grid class

        renderSubset(contentDiv, items, targetDrug, type);

        resultsContainer.appendChild(contentDiv);
        firstTab = false;
    });

    resultsArea.classList.remove('hidden');
}

// Expose switchTab globally
window.switchTab = (tabId) => {
    // Buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        if (btn.dataset.tab === tabId) btn.classList.add('active');
        else btn.classList.remove('active');
    });

    // Content
    document.querySelectorAll('.tab-content').forEach(content => {
        if (content.id === `tab-${tabId}`) content.classList.add('active');
        else content.classList.remove('active');
    });
};

function renderSubset(container, items, targetDrug, typeName) {
    const groups = {};
    items.forEach(item => {
        const [d1, d2] = [item.drug1_name, item.drug2_name].sort();
        const key = `${d1}|${d2}`;

        if (!groups[key]) {
            groups[key] = {
                d1, d2,
                type: typeName,
                items: [],
                statusSet: new Set()
            };
        }
        groups[key].items.push(item);
        groups[key].statusSet.add(item.result);
    });

    const groupArray = Object.values(groups);
    if (targetDrug) {
        groupArray.sort((a, b) => {
            const pA = (a.d1 === targetDrug) ? a.d2 : a.d1;
            const pB = (b.d1 === targetDrug) ? b.d2 : b.d1;
            return pA.localeCompare(pB);
        });
    } else {
        groupArray.sort((a, b) => a.d1.localeCompare(b.d1) || a.d2.localeCompare(b.d2));
    }

    groupArray.forEach(group => {
        const card = createGroupCard(group, targetDrug);
        container.appendChild(card);
    });
}


function createGroupCard(group, targetDrug) {
    const card = document.createElement('div');
    card.className = 'result-card group-card';

    let overallStatus = '?';
    if (group.statusSet.has('I')) {
        if (group.statusSet.has('C') || group.statusSet.has('U')) overallStatus = 'VI';
        else overallStatus = 'I';
    } else if (group.statusSet.has('U')) {
        overallStatus = 'U';
    } else if (group.statusSet.has('C')) {
        overallStatus = 'C';
    }
    if (group.statusSet.size > 1 && overallStatus !== 'VI' && overallStatus !== 'I') {
        if (group.statusSet.has('C') && group.statusSet.has('U')) overallStatus = 'V';
    }

    const mappedResult = resultMapping[overallStatus] || { text: overallStatus, class: '' };

    let titleHtml = '';
    if (targetDrug) {
        const partner = (group.d1 === targetDrug) ? group.d2 : group.d1;
        titleHtml = `<strong>${escapeHtml(partner)}</strong>`;
    } else {
        titleHtml = `<strong>${escapeHtml(group.d1)}</strong> <span style="margin: 0 0.5rem; color: var(--text-secondary);">+</span> <strong>${escapeHtml(group.d2)}</strong>`;
    }

    const headerHtml = `
        <div class="result-header group-header" onclick="window.toggleGroup(this)">
            <div style="flex:1;">
                <div class="group-title">
                    ${titleHtml}
                </div>
                <div class="type-badge-area">
                    <span class="count-badge">${group.items.length} conditions</span>
                </div>
            </div>
            
            <div style="display:flex; align-items:center; gap: 1rem;">
                <span class="compatibility-badge ${mappedResult.class}">${mappedResult.text}</span>
                 <span class="toggle-icon">▼</span>
            </div>
        </div>
    `;

    let detailsHtml = '<div class="group-details hidden">';
    group.items.forEach((item, index) => {
        const itemStatus = resultMapping[item.result] || { text: item.result, class: '' };
        detailsHtml += `
            <div class="condition-row">
                 <div class="condition-header">
                    <span class="status-dot ${itemStatus.class}" title="${itemStatus.text}">●</span>
                    <span>${index + 1}. <strong>${escapeHtml(item.drug1_conc || 'Unspecified Conc')}</strong> + <strong>${escapeHtml(item.drug2_conc || 'Unspecified Conc')}</strong></span>
                 </div>
                 <div class="condition-meta">
                    ${item.drug1_vehicle ? `<div>Vehicle: ${escapeHtml(item.drug1_vehicle)}</div>` : ''}
                    ${item.container ? `<div>Container: ${escapeHtml(item.container)}</div>` : ''}
                    ${item.storage ? `<div>Storage: ${escapeHtml(item.storage)}</div>` : ''}
                    ${item.study_period ? `<div>Study Period: ${escapeHtml(item.study_period)}</div>` : ''}
                 </div>
                  ${item.compatibility ? `<div class="condition-note">Physical: ${escapeHtml(item.compatibility)}</div>` : ''}
                  ${item.stability ? `<div class="condition-note">Chemical: ${escapeHtml(item.stability)}</div>` : ''}
                  ${item.notes ? `<div class="condition-note">Note: ${escapeHtml(item.notes)}</div>` : ''}
            </div>
        `;
    });
    detailsHtml += '</div>';

    card.innerHTML = headerHtml + detailsHtml;
    return card;
}

window.toggleGroup = (headerElement) => {
    const details = headerElement.nextElementSibling;
    const icon = headerElement.querySelector('.toggle-icon');

    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        icon.style.transform = 'rotate(180deg)';
    } else {
        details.classList.add('hidden');
        icon.style.transform = 'rotate(0deg)';
    }
};

function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// PWA Install Prompt Handling
let deferredPrompt;
const installBtn = document.getElementById('install-btn');

window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    installBtn.classList.remove('hidden');
});

installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
        // Show the install prompt
        deferredPrompt.prompt();
        // Wait for the user to respond to the prompt
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        // We've used the prompt, and can't use it again, throw it away
        deferredPrompt = null;
        installBtn.classList.add('hidden');
    }
});

// Hide button when successfully installed
window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    installBtn.classList.add('hidden');
    console.log('PWA was installed');
});
