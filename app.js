// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
    GAS_URL: 'https://script.google.com/macros/s/AKfycbyyfXoe7tzhnyGy17O5azHjoS8eVDfP7oh4UXiuX41rxnfo-f2FgX_Mb-cPEYdnejYZwg/exec',
    PRINT_CACHE_HOURS: 24,
    PRINT_CACHE_KEY: 'qr-print-cache'
};

// ══════════════════════════════════════════════════════════════════════════════
// STATE & DOM
// ══════════════════════════════════════════════════════════════════════════════
const state = {
    currentStep: 'step-input',
    currentTab: 'manual',
    qrData: { title: '', content: '', bottomText: '' },
    printer: null,
    printerDevice: null,
    templates: [],
    codes: [],
    currentCode: null,
    printCache: {}
};

const elements = {
    steps: {
        input: document.getElementById('step-input'),
        preview: document.getElementById('step-preview'),
        printer: document.getElementById('step-printer'),
        complete: document.getElementById('step-complete')
    },
    tabs: {
        manual: document.querySelector('[data-tab="manual"]'),
        codes: document.querySelector('[data-tab="codes"]')
    },
    tabContents: {
        manual: document.getElementById('tab-manual'),
        codes: document.getElementById('tab-codes')
    },
    inputs: {
        title: document.getElementById('title'),
        content: document.getElementById('qr-content'),
        bottomText: document.getElementById('bottom-text'),
        headerTemplate: document.getElementById('header-template'),
        customHeader: document.getElementById('custom-header-input')
    },
    buttons: {
        generate: document.getElementById('btn-generate'),
        edit: document.getElementById('btn-edit'),
        print: document.getElementById('btn-print'),
        connect: document.getElementById('btn-connect'),
        printConfirm: document.getElementById('btn-print-confirm'),
        printAnother: document.getElementById('btn-print-another'),
        newQr: document.getElementById('btn-new-qr'),
        saveTemplate: document.getElementById('btn-save-template')
    },
    displays: {
        title: document.getElementById('qr-title-display'),
        qrCode: document.getElementById('qr-code-display'),
        bottom: document.getElementById('qr-bottom-display'),
        printerStatus: document.getElementById('printer-status'),
        printerInfo: document.getElementById('printer-info'),
        printerName: document.getElementById('printer-name'),
        templatesList: document.getElementById('templates-list')
    },
    codes: {
        list: document.getElementById('codes-list'),
        loading: document.getElementById('codes-loading'),
        refreshBtn: document.getElementById('btn-refresh-codes'),
        clearCacheBtn: document.getElementById('btn-clear-cache')
    },
    toast: document.getElementById('toast')
};

// ══════════════════════════════════════════════════════════════════════════════
// INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
    loadPrintCache();
    loadTemplates();
    renderTemplates();
    setupEventListeners();
    
    // Toggle custom header input based on dropdown
    elements.inputs.headerTemplate.addEventListener('change', () => {
        elements.inputs.customHeader.style.display = 
            elements.inputs.headerTemplate.value === 'custom' ? 'block' : 'none';
    });
});

function setupEventListeners() {
    elements.buttons.generate.addEventListener('click', generateQR);
    elements.buttons.edit.addEventListener('click', () => showStep('step-input'));
    elements.buttons.print.addEventListener('click', () => showStep('step-printer'));
    elements.buttons.printAnother.addEventListener('click', () => {
        showStep('step-printer');
        if (state.printer) {
            elements.buttons.printConfirm.style.display = 'block';
            elements.buttons.connect.style.display = 'none';
        }
    });
    elements.buttons.newQr.addEventListener('click', () => { resetForm(); showStep('step-input'); });
    elements.buttons.saveTemplate.addEventListener('click', saveTemplate);
    elements.buttons.connect.addEventListener('click', connectPrinter);
    elements.buttons.printConfirm.addEventListener('click', executePrint); // Renamed for clarity

    if (elements.tabs.manual) elements.tabs.manual.addEventListener('click', () => switchTab('manual'));
    if (elements.tabs.codes) elements.tabs.codes.addEventListener('click', () => switchTab('codes'));
    if (elements.codes.refreshBtn) elements.codes.refreshBtn.addEventListener('click', loadCodesFromSheet);
    if (elements.codes.clearCacheBtn) elements.codes.clearCacheBtn.addEventListener('click', clearPrintCache);
}

// ══════════════════════════════════════════════════════════════════════════════
// UI & NAVIGATION
// ══════════════════════════════════════════════════════════════════════════════
function showStep(stepId) {
    Object.values(elements.steps).forEach(step => step.classList.remove('active'));
    const target = elements.steps[stepId.replace('step-', '')];
    if (target) target.classList.add('active');
    state.currentStep = stepId;
}

function switchTab(tabName) {
    state.currentTab = tabName;
    Object.values(elements.tabs).forEach(btn => { if(btn) btn.classList.toggle('active', btn.dataset.tab === tabName); });
    Object.values(elements.tabContents).forEach(content => { if(content) content.classList.toggle('active', content.id === `tab-${tabName}`); });
    if (tabName === 'codes' && state.codes.length === 0) loadCodesFromSheet();
}

function showToast(message, type = '') {
    elements.toast.textContent = message;
    elements.toast.className = 'toast show ' + type;
    setTimeout(() => { elements.toast.className = 'toast'; }, 3000);
}

function resetForm() {
    elements.inputs.title.value = '';
    elements.inputs.content.value = '';
    elements.inputs.bottomText.value = '';
    elements.displays.title.textContent = '';
    elements.displays.bottom.textContent = '';
    elements.displays.qrCode.innerHTML = '';
    elements.buttons.saveTemplate.style.display = 'none';
    state.currentCode = null;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRINT CACHE
// ══════════════════════════════════════════════════════════════════════════════
function loadPrintCache() {
    const cached = localStorage.getItem(CONFIG.PRINT_CACHE_KEY);
    if (cached) {
        state.printCache = JSON.parse(cached);
        cleanExpiredCache();
    }
}
function savePrintCache() { localStorage.setItem(CONFIG.PRINT_CACHE_KEY, JSON.stringify(state.printCache)); }
function cleanExpiredCache() {
    const now = Date.now();
    const expiryMs = CONFIG.PRINT_CACHE_HOURS * 60 * 60 * 1000;
    Object.keys(state.printCache).forEach(key => {
        if (now - state.printCache[key].timestamp > expiryMs) delete state.printCache[key];
    });
    savePrintCache();
}
function isPrinted(code) { return state.printCache[code] !== undefined; }
function markAsPrinted(code) {
    state.printCache[code] = { timestamp: Date.now(), printedAt: new Date().toISOString() };
    savePrintCache();
}
function clearPrintCache() {
    if (confirm('Clear all print history?')) {
        state.printCache = {};
        savePrintCache();
        showToast('Print cache cleared!', 'success');
        renderCodesList();
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEET CODES & INSTANT PRINT
// ══════════════════════════════════════════════════════════════════════════════
async function loadCodesFromSheet() {
    if (!elements.codes.loading || !elements.codes.list) return;
    elements.codes.loading.style.display = 'block';
    elements.codes.list.innerHTML = '';
    
    try {
        const response = await fetch(`${CONFIG.GAS_URL}?t=${Date.now()}`);
        const result = await response.json();
        if (result.status === 'success') {
            state.codes = result.codes || [];
            renderCodesList();
            showToast(`Loaded ${state.codes.length} codes`, 'success');
        } else {
            throw new Error(result.message || 'Failed to load');
        }
    } catch (error) {
        elements.codes.list.innerHTML = `<div class="error-state"><p>❌ Failed to load codes</p><p style="font-size:0.85rem;color:var(--danger)">${error.message}</p></div>`;
        showToast('Failed to load codes', 'error');
    } finally {
        elements.codes.loading.style.display = 'none';
    }
}

function renderCodesList() {
    if (!elements.codes.list) return;
    if (state.codes.length === 0) {
        elements.codes.list.innerHTML = '<p class="empty-state">No codes found in the sheet</p>';
        return;
    }
    
    elements.codes.list.innerHTML = state.codes.map(code => {
        const printed = isPrinted(code);
        const printInfo = printed ? state.printCache[code] : null;
        
        return `
            <div class="question-item ${printed ? 'printed' : ''}" data-code="${code}">
                <div class="question-content">
                    <div class="question-id"><strong>${code}</strong> ${printed ? '<span class="printed-badge">✓ Printed</span>' : ''}</div>
                    ${printInfo ? `<div class="print-info"><small>Printed: ${new Date(printInfo.printedAt).toLocaleTimeString()}</small></div>` : ''}
                </div>
                <div class="question-actions">
                    <button class="btn btn-sm btn-primary print-code-btn" data-code="${code}">
                        ${printed ? '🔄 Reprint' : '🖨️ Print'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.print-code-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const code = e.target.dataset.code;
            triggerInstantPrint(code);
        });
    });
}

// NEW: Instant Print Logic (No scrolling, no page navigation if connected)
function triggerInstantPrint(code) {
    state.currentCode = code;
    
    // Get EXACTLY what the user selected. No auto-appending the code.
    const template = elements.inputs.headerTemplate.value;
    const header = template === 'custom' ? elements.inputs.customHeader.value.trim() : template;
    
    state.qrData = {
        title: header,       // Exactly the template string (or empty)
        content: code,       // QR code is JUST the code
        bottomText: ''
    };
    
    // Prepare hidden/visible canvas for printing
    elements.displays.title.textContent = header;
    elements.displays.bottom.textContent = '';
    elements.displays.qrCode.innerHTML = '';
    
    new QRCode(elements.displays.qrCode, {
        text: code,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    // Wait a tick for QRCode lib to render the canvas, then print or connect
    setTimeout(() => {
        if (state.printer) {
            // Printer is connected! Print immediately in the background.
            showToast('Printing...', 'success');
            executePrint();
        } else {
            // Not connected, show the connection screen
            showStep('step-printer');
            elements.buttons.printConfirm.style.display = 'none';
            elements.buttons.connect.style.display = 'block';
        }
    }, 100);
}

// ══════════════════════════════════════════════════════════════════════════════
// MANUAL QR GENERATION
// ══════════════════════════════════════════════════════════════════════════════
function generateQR() {
    const title = elements.inputs.title.value.trim();
    const content = elements.inputs.content.value.trim();
    const bottomText = elements.inputs.bottomText.value.trim();

    if (!content) {
        showToast('Please enter QR code content', 'error');
        elements.inputs.content.focus();
        return;
    }

    state.currentCode = null;
    state.qrData = { title, content, bottomText };

    elements.displays.title.textContent = title;
    elements.displays.bottom.textContent = bottomText;
    elements.displays.qrCode.innerHTML = '';

    new QRCode(elements.displays.qrCode, {
        text: content,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    elements.buttons.saveTemplate.style.display = 'block';
    showStep('step-preview');
    showToast('QR Code generated successfully!', 'success');
}

// ══════════════════════════════════════════════════════════════════════════════
// BLUETOOTH PRINTER (Proven Working 64-byte / 50ms)
// ══════════════════════════════════════════════════════════════════════════════
async function connectPrinter() {
    if (!navigator.bluetooth) {
        showToast('Web Bluetooth not supported. Use Chrome on Android.', 'error');
        return;
    }
    try {
        elements.displays.printerStatus.innerHTML = `<div class="loading"></div><p>Select your printer...</p>`;
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb', '0000ff00-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000fee7-0000-1000-8000-00805f9b34fb', '00001101-0000-1000-8000-00805f9b34fb', '0000fff0-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb']
        });
        elements.displays.printerStatus.innerHTML = `<div class="loading"></div><p>Connecting to ${device.name || 'Printer'}...</p>`;
        
        const server = await device.gatt.connect();
        state.printer = server;
        state.printerDevice = device;
        
        const services = await server.getPrimaryServices();
        let targetChar = null;
        for (const service of services) {
            const chars = await service.getCharacteristics();
            for (const char of chars) {
                if (char.properties.write || char.properties.writeWithoutResponse) {
                    targetChar = char;
                    break;
                }
            }
            if (targetChar) break;
        }
        if (!targetChar) throw new Error('Printer does not support write characteristic');

        device.addEventListener('gattserverdisconnected', () => {
            state.printer = null;
            state.printerDevice = null;
            showToast('Printer disconnected', 'error');
            elements.buttons.printConfirm.style.display = 'none';
            elements.buttons.connect.style.display = 'block';
            elements.displays.printerStatus.innerHTML = `<div class="status-icon">🔍</div><p>Searching for Bluetooth thermal printer...</p>`;
        });

        elements.displays.printerStatus.innerHTML = `<div class="status-icon">✅</div><p>Connected: ${device.name || 'Unknown Printer'}</p>`;
        elements.displays.printerInfo.style.display = 'block';
        elements.displays.printerName.textContent = device.name || 'Unknown Printer';
        elements.buttons.printConfirm.style.display = 'block';
        elements.buttons.connect.style.display = 'none';
        showToast('Printer connected successfully!', 'success');
    } catch (error) {
        console.error('Bluetooth connection error:', error);
        if (error.name !== 'NotFoundError') {
            elements.displays.printerStatus.innerHTML = `<div class="status-icon">❌</div><p>Connection failed: ${error.message}</p>`;
            showToast('Failed to connect: ' + error.message, 'error');
        } else {
            elements.displays.printerStatus.innerHTML = `<div class="status-icon">🔍</div><p>Searching for Bluetooth thermal printer...</p>`;
        }
    }
}

function getRasterCommands(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height).data;
    const widthBytes = Math.ceil(width / 8);
    const commands = [];
    
    commands.push(0x1D, 0x76, 0x30, 0x00);
    commands.push(widthBytes % 256, Math.floor(widthBytes / 256));
    commands.push(height % 256, Math.floor(height / 256));
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x += 8) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                if (x + bit < width) {
                    const idx = (y * width + (x + bit)) * 4;
                    const brightness = (imageData[idx] + imageData[idx + 1] + imageData[idx + 2]) / 3;
                    if (brightness < 128) byte |= (1 << (7 - bit));
                }
            }
            commands.push(byte);
        }
    }
    return commands;
}

async function sendCommandsToPrinter(commands) {
    const services = await state.printer.getPrimaryServices();
    let targetChar = null;
    for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
            if (char.properties.writeWithoutResponse || char.properties.write) {
                targetChar = char;
                break;
            }
        }
        if (targetChar) break;
    }
    if (!targetChar) throw new Error('No writable characteristic found');
    
    const useNoResponse = targetChar.properties.writeWithoutResponse;
    const chunkSize = 64;
    
    for (let i = 0; i < commands.length; i += chunkSize) {
        const chunk = new Uint8Array(commands.slice(i, i + chunkSize));
        if (useNoResponse) await targetChar.writeValueWithoutResponse(chunk);
        else await targetChar.writeValue(chunk);
        await new Promise(r => setTimeout(r, 50));
    }
}

// Core Print Execution (Called by both "Print Now" button and Instant Print)
async function executePrint() {
    if (!state.printer) {
        showToast('Please connect to a printer first', 'error');
        return;
    }
    try {
        const qrCanvas = elements.displays.qrCode.querySelector('canvas');
        if (!qrCanvas) {
            showToast('QR Code not found. Please generate it first.', 'error');
            return;
        }

        const printCanvas = document.createElement('canvas');
        printCanvas.width = 256;
        printCanvas.height = 256;
        const ctx = printCanvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, 256, 256);
        ctx.drawImage(qrCanvas, 0, 0, 256, 256);

        const commands = [];
        commands.push(0x1B, 0x40); // Initialize
        commands.push(0x1B, 0x61, 0x01); // Center align

        if (state.qrData.title) {
            commands.push(0x1B, 0x21, 0x30); // Bold + Double
            commands.push(...stringToBytes(state.qrData.title));
            commands.push(0x0A);
            commands.push(0x1B, 0x21, 0x00); // Reset
        }
        commands.push(0x0A);

        commands.push(...getRasterCommands(printCanvas));
        commands.push(0x0A, 0x0A);

        if (state.qrData.bottomText) {
            commands.push(...stringToBytes(state.qrData.bottomText));
            commands.push(0x0A);
        }

        commands.push(0x0A, 0x0A, 0x0A, 0x0A);
        commands.push(0x1D, 0x56, 0x00); // Full cut

        await sendCommandsToPrinter(commands);

        if (state.currentCode) markAsPrinted(state.currentCode);

        showStep('step-complete');
        showToast('Printed successfully!', 'success');

        if (state.currentTab === 'codes') renderCodesList();

    } catch (error) {
        console.error('Print error:', error);
        showToast('Print failed: ' + error.message, 'error');
    }
}

function stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) bytes.push(str.charCodeAt(i));
    return bytes;
}

// ══════════════════════════════════════════════════════════════════════════════
// TEMPLATES (Manual Tab)
// ══════════════════════════════════════════════════════════════════════════════
function loadTemplates() {
    const saved = localStorage.getItem('qr-templates');
    if (saved) state.templates = JSON.parse(saved);
}
function saveTemplates() {
    localStorage.setItem('qr-templates', JSON.stringify(state.templates));
}
function saveTemplate() {
    state.templates.unshift({
        id: Date.now(),
        title: state.qrData.title,
        content: state.qrData.content,
        bottomText: state.qrData.bottomText,
        createdAt: new Date().toLocaleDateString()
    });
    saveTemplates();
    renderTemplates();
    showToast('Template saved!', 'success');
}
function renderTemplates() {
    if (state.templates.length === 0) {
        elements.displays.templatesList.innerHTML = `<p class="empty-state">No saved templates yet.</p>`;
        return;
    }
    elements.displays.templatesList.innerHTML = state.templates.map(t => `
        <div class="template-item" data-id="${t.id}">
            <div class="template-content">
                <strong>${t.title || 'No title'}</strong><br>
                <small>${t.content.substring(0, 50)}${t.content.length > 50 ? '...' : ''}</small>
            </div>
            <button class="template-delete" data-id="${t.id}">🗑️</button>
        </div>
    `).join('');
    
    document.querySelectorAll('.template-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('template-delete')) return;
            const t = state.templates.find(x => x.id === parseInt(item.dataset.id));
            if (t) {
                elements.inputs.title.value = t.title;
                elements.inputs.content.value = t.content;
                elements.inputs.bottomText.value = t.bottomText;
                generateQR();
            }
        });
    });
    document.querySelectorAll('.template-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            state.templates = state.templates.filter(t => t.id !== parseInt(btn.dataset.id));
            saveTemplates();
            renderTemplates();
            showToast('Template deleted', 'success');
        });
    });
}