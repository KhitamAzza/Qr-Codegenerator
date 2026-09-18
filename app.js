// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════
const CONFIG = {
    // REPLACE WITH YOUR GOOGLE APPS SCRIPT WEB APP URL
    GAS_URL: 'https://script.google.com/macros/s/AKfycbyyfXoe7tzhnyGy17O5azHjoS8eVDfP7oh4UXiuX41rxnfo-f2FgX_Mb-cPEYdnejYZwg/exec',
    PRINT_CACHE_HOURS: 24, // Cache expires after 24 hours
    PRINT_CACHE_KEY: 'qr-print-cache'
};

// ══════════════════════════════════════════════════════════════════════════════
// APP STATE
// ══════════════════════════════════════════════════════════════════════════════
const state = {
    currentStep: 'step-input',
    currentTab: 'manual',
    qrData: {
        title: '',
        content: '',
        bottomText: ''
    },
    printer: null,
    printerDevice: null,
    templates: [],
    questions: [],
    currentQuestion: null,
    printCache: {}
};

// ══════════════════════════════════════════════════════════════════════════════
// DOM ELEMENTS
// ══════════════════════════════════════════════════════════════════════════════
const elements = {
    steps: {
        input: document.getElementById('step-input'),
        preview: document.getElementById('step-preview'),
        printer: document.getElementById('step-printer'),
        complete: document.getElementById('step-complete')
    },
    tabs: {
        manual: document.querySelector('[data-tab="manual"]'),
        questions: document.querySelector('[data-tab="questions"]')
    },
    tabContents: {
        manual: document.getElementById('tab-manual'),
        questions: document.getElementById('tab-questions')
    },
    inputs: {
        title: document.getElementById('title'),
        content: document.getElementById('qr-content'),
        bottomText: document.getElementById('bottom-text')
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
    questions: {
        list: document.getElementById('questions-list'),
        loading: document.getElementById('questions-loading'),
        refreshBtn: document.getElementById('btn-refresh-questions'),
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
});

function setupEventListeners() {
    // Manual Tab
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
    elements.buttons.newQr.addEventListener('click', () => {
        resetForm();
        showStep('step-input');
    });
    elements.buttons.saveTemplate.addEventListener('click', saveTemplate);

    // Bluetooth
    elements.buttons.connect.addEventListener('click', connectPrinter);
    elements.buttons.printConfirm.addEventListener('click', printQR);

    // Tabs
    if (elements.tabs.manual) elements.tabs.manual.addEventListener('click', () => switchTab('manual'));
    if (elements.tabs.questions) elements.tabs.questions.addEventListener('click', () => switchTab('questions'));

    // Questions Tab
    if (elements.questions.refreshBtn) elements.questions.refreshBtn.addEventListener('click', loadQuestionsFromSheet);
    if (elements.questions.clearCacheBtn) elements.questions.clearCacheBtn.addEventListener('click', clearPrintCache);
}

// ══════════════════════════════════════════════════════════════════════════════
// NAVIGATION & UI HELPERS
// ══════════════════════════════════════════════════════════════════════════════
function showStep(stepId) {
    Object.values(elements.steps).forEach(step => step.classList.remove('active'));
    const target = elements.steps[stepId.replace('step-', '')];
    if (target) target.classList.add('active');
    state.currentStep = stepId;
}

function switchTab(tabName) {
    state.currentTab = tabName;
    
    Object.values(elements.tabs).forEach(btn => {
        if (btn) btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    Object.values(elements.tabContents).forEach(content => {
        if (content) content.classList.toggle('active', content.id === `tab-${tabName}`);
    });

    if (tabName === 'questions' && state.questions.length === 0) {
        loadQuestionsFromSheet();
    }
}

function showToast(message, type = '') {
    elements.toast.textContent = message;
    elements.toast.className = 'toast show ' + type;
    setTimeout(() => {
        elements.toast.className = 'toast';
    }, 3000);
}

function resetForm() {
    elements.inputs.title.value = '';
    elements.inputs.content.value = '';
    elements.inputs.bottomText.value = '';
    elements.displays.title.textContent = '';
    elements.displays.bottom.textContent = '';
    elements.displays.qrCode.innerHTML = '';
    elements.buttons.saveTemplate.style.display = 'none';
    state.currentQuestion = null;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRINT CACHE MANAGEMENT (Local Storage)
// ══════════════════════════════════════════════════════════════════════════════
function loadPrintCache() {
    const cached = localStorage.getItem(CONFIG.PRINT_CACHE_KEY);
    if (cached) {
        state.printCache = JSON.parse(cached);
        cleanExpiredCache();
    }
}

function savePrintCache() {
    localStorage.setItem(CONFIG.PRINT_CACHE_KEY, JSON.stringify(state.printCache));
}

function cleanExpiredCache() {
    const now = Date.now();
    const expiryMs = CONFIG.PRINT_CACHE_HOURS * 60 * 60 * 1000;
    let cleaned = 0;
    
    Object.keys(state.printCache).forEach(key => {
        if (now - state.printCache[key].timestamp > expiryMs) {
            delete state.printCache[key];
            cleaned++;
        }
    });
    
    if (cleaned > 0) {
        savePrintCache();
        console.log(`Cleaned ${cleaned} expired print cache entries`);
    }
}

function isPrinted(questionId) {
    return state.printCache[questionId] !== undefined;
}

function markAsPrinted(questionId, data) {
    state.printCache[questionId] = {
        timestamp: Date.now(),
        printedAt: new Date().toISOString(),
        data: data
    };
    savePrintCache();
}

function clearPrintCache() {
    if (confirm('Clear all print history? This will mark all codes as "not printed".')) {
        state.printCache = {};
        savePrintCache();
        showToast('Print cache cleared!', 'success');
        if (state.questions.length > 0) {
            renderQuestionsList();
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// GOOGLE SHEETS INTEGRATION
// ══════════════════════════════════════════════════════════════════════════════
async function loadQuestionsFromSheet() {
    if (!elements.questions.loading || !elements.questions.list) return;
    
    elements.questions.loading.style.display = 'block';
    elements.questions.list.innerHTML = '';
    
    try {
        // Cache-busting timestamp to ensure fresh data
        const response = await fetch(`${CONFIG.GAS_URL}?t=${Date.now()}`);
        const result = await response.json();
        
        if (result.status === 'success') {
            state.questions = result.questions || [];
            renderQuestionsList();
            showToast(`Loaded ${state.questions.length} questions`, 'success');
        } else {
            throw new Error(result.message || 'Failed to load questions');
        }
    } catch (error) {
        console.error('Load questions error:', error);
        elements.questions.list.innerHTML = `
            <div class="error-state">
                <p>❌ Failed to load questions</p>
                <p style="font-size: 0.85rem; color: var(--danger);">${error.message}</p>
            </div>
        `;
        showToast('Failed to load questions', 'error');
    } finally {
        elements.questions.loading.style.display = 'none';
    }
}

function renderQuestionsList() {
    if (!elements.questions.list) return;

    if (state.questions.length === 0) {
        elements.questions.list.innerHTML = '<p class="empty-state">No questions found in the sheet</p>';
        return;
    }
    
    elements.questions.list.innerHTML = state.questions.map(q => {
        const printed = isPrinted(q.question_id);
        const printInfo = printed ? state.printCache[q.question_id] : null;
        
        return `
            <div class="question-item ${printed ? 'printed' : ''}" data-question-id="${q.question_id}">
                <div class="question-content">
                    <div class="question-id">
                        <strong>ID:</strong> ${q.question_id}
                        ${printed ? '<span class="printed-badge">✓ Printed</span>' : ''}
                    </div>
                    ${printInfo ? `<div class="print-info"><small>Printed: ${new Date(printInfo.printedAt).toLocaleString()}</small></div>` : ''}
                </div>
                <div class="question-actions">
                    <button class="btn btn-sm btn-primary print-question-btn" data-id="${q.question_id}">
                        ${printed ? '🔄 Reprint' : '🖨️ Print'}
                    </button>
                </div>
            </div>
        `;
    }).join('');
    
    document.querySelectorAll('.print-question-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const questionId = e.target.dataset.id;
            const question = state.questions.find(q => q.question_id === questionId);
            if (question) prepareQuestionForPrint(question);
        });
    });
}

function prepareQuestionForPrint(question) {
    state.currentQuestion = question;
    state.qrData = {
        title: `Question ${question.question_id}`,
        content: question.question_id,
        bottomText: ''
    };
    
    elements.displays.title.textContent = state.qrData.title;
    elements.displays.bottom.textContent = state.qrData.bottomText;
    elements.displays.qrCode.innerHTML = '';
    
    new QRCode(elements.displays.qrCode, {
        text: question.question_id,
        width: 256,
        height: 256,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    
    showStep('step-printer');
    if (state.printer) {
        elements.buttons.printConfirm.style.display = 'block';
        elements.buttons.connect.style.display = 'none';
    } else {
        elements.buttons.printConfirm.style.display = 'none';
        elements.buttons.connect.style.display = 'block';
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// QR CODE GENERATION (Manual)
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

    state.currentQuestion = null; // Clear any sheet question context
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
// BLUETOOTH PRINTER CONNECTION
// ══════════════════════════════════════════════════════════════════════════════
async function connectPrinter() {
    if (!navigator.bluetooth) {
        showToast('Web Bluetooth not supported. Use Chrome on Android.', 'error');
        return;
    }

    try {
        elements.displays.printerStatus.innerHTML = `
            <div class="loading"></div>
            <p>Select your printer from the list...</p>
        `;

        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '000018f0-0000-1000-8000-00805f9b34fb',
                '0000ff00-0000-1000-8000-00805f9b34fb',
                'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
                '49535343-fe7d-4ae5-8fa9-9fafd205e455',
                '0000fee7-0000-1000-8000-00805f9b34fb',
                '00001101-0000-1000-8000-00805f9b34fb',
                '0000fff0-0000-1000-8000-00805f9b34fb',
                '0000ffe0-0000-1000-8000-00805f9b34fb'
            ]
        });

        elements.displays.printerStatus.innerHTML = `
            <div class="loading"></div>
            <p>Connecting to ${device.name || 'Printer'}...</p>
        `;

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
            elements.displays.printerStatus.innerHTML = `
                <div class="status-icon">🔍</div>
                <p>Searching for Bluetooth thermal printer...</p>
            `;
        });

        elements.displays.printerStatus.innerHTML = `
            <div class="status-icon">✅</div>
            <p>Connected: ${device.name || 'Unknown Printer'}</p>
        `;
        elements.displays.printerInfo.style.display = 'block';
        elements.displays.printerName.textContent = device.name || 'Unknown Printer';
        elements.buttons.printConfirm.style.display = 'block';
        elements.buttons.connect.style.display = 'none';

        showToast('Printer connected successfully!', 'success');

    } catch (error) {
        console.error('Bluetooth connection error:', error);
        if (error.name !== 'NotFoundError') {
            elements.displays.printerStatus.innerHTML = `
                <div class="status-icon">❌</div>
                <p>Connection failed: ${error.message}</p>
            `;
            showToast('Failed to connect: ' + error.message, 'error');
        } else {
            elements.displays.printerStatus.innerHTML = `
                <div class="status-icon">🔍</div>
                <p>Searching for Bluetooth thermal printer...</p>
            `;
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// PRINTING SYSTEM (Raster - Proven Working for RPP02N / C-5813)
// ══════════════════════════════════════════════════════════════════════════════
function getRasterCommands(canvas) {
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const imageData = ctx.getImageData(0, 0, width, height).data;
    
    const widthBytes = Math.ceil(width / 8);
    const commands = [];
    
    // GS v 0 m xL xH yL yH
    commands.push(0x1D, 0x76, 0x30, 0x00); // m=0 (normal density)
    commands.push(widthBytes % 256, Math.floor(widthBytes / 256)); // xL, xH (width in BYTES)
    commands.push(height % 256, Math.floor(height / 256)); // yL, yH (height in dots)
    
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x += 8) {
            let byte = 0;
            for (let bit = 0; bit < 8; bit++) {
                if (x + bit < width) {
                    const idx = (y * width + (x + bit)) * 4;
                    const r = imageData[idx];
                    const g = imageData[idx + 1];
                    const b = imageData[idx + 2];
                    const brightness = (r + g + b) / 3;
                    if (brightness < 128) {
                        byte |= (1 << (7 - bit)); // MSB-first per ESC/POS raster spec
                    }
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
    let targetService = null;
    
    for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
            if (char.properties.writeWithoutResponse || char.properties.write) {
                targetChar = char;
                targetService = service;
                break;
            }
        }
        if (targetChar) break;
    }
    
    if (!targetChar) throw new Error('No writable characteristic found');
    
    const useNoResponse = targetChar.properties.writeWithoutResponse;
    const chunkSize = 64; // Proven working for RPP02N
    const totalChunks = Math.ceil(commands.length / chunkSize);
    
    for (let i = 0; i < commands.length; i += chunkSize) {
        const chunkIndex = Math.floor(i / chunkSize);
        const chunk = new Uint8Array(commands.slice(i, i + chunkSize));
        
        try {
            if (useNoResponse) {
                await targetChar.writeValueWithoutResponse(chunk);
            } else {
                await targetChar.writeValue(chunk);
            }
        } catch (err) {
            throw new Error(`Failed at chunk ${chunkIndex + 1}/${totalChunks} (${err.name}): ${err.message}`);
        }
        
        // 50ms delay prevents buffer overflow on the printer's BLE module
        await new Promise(r => setTimeout(r, 50));
    }
}

async function printQR() {
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

        const rasterCommands = getRasterCommands(printCanvas);
        commands.push(...rasterCommands);
        commands.push(0x0A, 0x0A);

        if (state.qrData.bottomText) {
            commands.push(...stringToBytes(state.qrData.bottomText));
            commands.push(0x0A);
        }

        commands.push(0x0A, 0x0A, 0x0A, 0x0A);
        commands.push(0x1D, 0x56, 0x00); // Full cut

        await sendCommandsToPrinter(commands);

        // Mark as printed in local cache if it came from the Questions sheet
        if (state.currentQuestion) {
            markAsPrinted(state.currentQuestion.question_id, {
                question_id: state.currentQuestion.question_id,
                title: state.qrData.title
            });
            
            // Optional: Also update Google Sheet (non-blocking)
            try {
                await fetch(CONFIG.GAS_URL, {
                    method: 'POST',
                    mode: 'no-cors', // Prevents CORS errors if script isn't set to "Anyone"
                    body: JSON.stringify({
                        action: 'markPrinted',
                        questionId: state.currentQuestion.question_id,
                        printData: { timestamp: new Date().toISOString() }
                    })
                });
            } catch (sheetError) {
                console.warn('Failed to update Google Sheet (non-critical):', sheetError);
            }
        }

        showStep('step-complete');
        showToast('Printed successfully!', 'success');

        if (state.currentTab === 'questions') {
            renderQuestionsList(); // Update UI to show "Printed" badge
        }

    } catch (error) {
        console.error('Print error:', error);
        showToast('Print failed: ' + error.message, 'error');
    }
}

function stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        bytes.push(str.charCodeAt(i));
    }
    return bytes;
}

// ══════════════════════════════════════════════════════════════════════════════
// TEMPLATES (Local Storage)
// ══════════════════════════════════════════════════════════════════════════════
function loadTemplates() {
    const saved = localStorage.getItem('qr-templates');
    if (saved) state.templates = JSON.parse(saved);
}

function saveTemplates() {
    localStorage.setItem('qr-templates', JSON.stringify(state.templates));
}

function saveTemplate() {
    const template = {
        id: Date.now(),
        title: state.qrData.title,
        content: state.qrData.content,
        bottomText: state.qrData.bottomText,
        createdAt: new Date().toLocaleDateString()
    };
    state.templates.unshift(template);
    saveTemplates();
    renderTemplates();
    showToast('Template saved!', 'success');
}

function renderTemplates() {
    if (state.templates.length === 0) {
        elements.displays.templatesList.innerHTML = `<p class="empty-state">No saved templates yet. Generate a QR code to save as template.</p>`;
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
            const id = parseInt(item.dataset.id);
            const template = state.templates.find(t => t.id === id);
            if (template) {
                elements.inputs.title.value = template.title;
                elements.inputs.content.value = template.content;
                elements.inputs.bottomText.value = template.bottomText;
                generateQR();
            }
        });
    });
    
    document.querySelectorAll('.template-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = parseInt(btn.dataset.id);
            state.templates = state.templates.filter(t => t.id !== id);
            saveTemplates();
            renderTemplates();
            showToast('Template deleted', 'success');
        });
    });
}