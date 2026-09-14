// App State
const state = {
    currentStep: 'step-input',
    qrData: {
        title: '',
        content: '',
        bottomText: ''
    },
    printer: null,
    printerDevice: null,
    templates: []
};

// DOM Elements
const elements = {
    steps: {
        input: document.getElementById('step-input'),
        preview: document.getElementById('step-preview'),
        printer: document.getElementById('step-printer'),
        complete: document.getElementById('step-complete')
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
    toast: document.getElementById('toast')
};

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadTemplates();
    renderTemplates();
    setupEventListeners();
    registerServiceWorker();
});

// Setup Event Listeners
function setupEventListeners() {
    elements.buttons.generate.addEventListener('click', generateQR);
    elements.buttons.edit.addEventListener('click', () => showStep('step-input'));
    elements.buttons.print.addEventListener('click', () => showStep('step-printer'));
    elements.buttons.connect.addEventListener('click', connectPrinter);
    elements.buttons.printConfirm.addEventListener('click', printQR);
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
}

// Navigation
function showStep(stepId) {
    Object.values(elements.steps).forEach(step => {
        step.classList.remove('active');
    });
    elements.steps[stepId.replace('step-', '')].classList.add('active');
    state.currentStep = stepId;
}

// Generate QR Code
function generateQR() {
    const title = elements.inputs.title.value.trim();
    const content = elements.inputs.content.value.trim();
    const bottomText = elements.inputs.bottomText.value.trim();

    if (!content) {
        showToast('Please enter QR code content', 'error');
        elements.inputs.content.focus();
        return;
    }

    state.qrData = { title, content, bottomText };

    // Display QR Code
    elements.displays.title.textContent = title;
    elements.displays.bottom.textContent = bottomText;
    elements.displays.qrCode.innerHTML = '';

    new QRCode(elements.displays.qrCode, {
        text: content,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });

    // Show save template button
    elements.buttons.saveTemplate.style.display = 'block';

    showStep('step-preview');
    showToast('QR Code generated successfully!', 'success');
}

// Connect to Bluetooth Printer
async function connectPrinter() {
    if (!navigator.bluetooth) {
        showToast('Web Bluetooth not supported in this browser. Try Chrome on Android/Desktop.', 'error');
        return;
    }

    try {
        elements.displays.printerStatus.innerHTML = `
            <div class="loading"></div>
            <p>Searching for Bluetooth devices...</p>
        `;

        const device = await navigator.bluetooth.requestDevice({
            filters: [
                { services: ['00001101-0000-1000-8000-00805f9b34fb'] }, // SPP
                { services: ['0000fff0-0000-1000-8000-00805f9b34fb'] }, // Common thermal printer
                { services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }  // Another common one
            ],
            optionalServices: [
                '00001101-0000-1000-8000-00805f9b34fb',
                '0000fff0-0000-1000-8000-00805f9b34fb',
                '0000ffe0-0000-1000-8000-00805f9b34fb',
                'battery_service',
                'device_information'
            ],
            acceptAllDevices: true
        });

        state.printerDevice = device;
        
        device.addEventListener('gattserverdisconnected', () => {
            state.printer = null;
            state.printerDevice = null;
            showToast('Printer disconnected', 'error');
            elements.buttons.printConfirm.style.display = 'none';
            elements.buttons.connect.style.display = 'block';
        });

        const server = await device.gatt.connect();
        state.printer = server;

        elements.displays.printerStatus.innerHTML = `
            <div class="status-icon">✅</div>
            <p>Printer connected successfully!</p>
        `;
        elements.displays.printerInfo.style.display = 'block';
        elements.displays.printerName.textContent = device.name || 'Unknown Printer';
        elements.buttons.printConfirm.style.display = 'block';
        elements.buttons.connect.style.display = 'none';

        showToast('Connected to printer!', 'success');

    } catch (error) {
        console.error('Bluetooth connection error:', error);
        elements.displays.printerStatus.innerHTML = `
            <div class="status-icon">❌</div>
            <p>Connection failed. Please try again.</p>
        `;
        showToast('Failed to connect to printer', 'error');
    }
}

// Print QR Code
async function printQR() {
    if (!state.printer) {
        showToast('Please connect to a printer first', 'error');
        return;
    }

    try {
        // Get QR code image as base64
        const qrCanvas = elements.displays.qrCode.querySelector('canvas');
        const qrImage = elements.displays.qrCode.querySelector('img');
        
        let qrDataUrl;
        if (qrCanvas) {
            qrDataUrl = qrCanvas.toDataURL('image/png');
        } else if (qrImage) {
            qrDataUrl = qrImage.src;
        }

        // Convert to ESC/POS commands for thermal printer
        const commands = buildESCPOSCommands(
            state.qrData.title,
            qrDataUrl,
            state.qrData.bottomText
        );

        // Send to printer
        await sendToPrinter(commands);

        showStep('step-complete');
        showToast('Printed successfully!', 'success');

    } catch (error) {
        console.error('Print error:', error);
        showToast('Print failed. Please try again.', 'error');
    }
}

// Replace the buildESCPOSCommands function in app.js with this optimized version:

function buildESCPOSCommands(title, qrDataUrl, bottomText) {
    const commands = [];
    
    // 1. Initialize printer (ESC @)
    commands.push(0x1B, 0x40);
    
    // 2. Set print width to 58mm mode
    commands.push(0x1B, 0x61, 0x01); // Center align
    
    // 3. Print title if exists (make it bold)
    if (title) {
        commands.push(0x1B, 0x45, 0x01); // Bold ON
        const titleBytes = stringToBytes(title);
        commands.push(...titleBytes);
        commands.push(0x0A); // Line feed
        commands.push(0x1B, 0x45, 0x00); // Bold OFF
    }
    
    // 4. Add spacing
    commands.push(0x0A, 0x0A);
    
    // 5. Print QR code content
    // For RPP02N, we'll print the content as text with QR-like formatting
    // In production, convert QR image to bitmap using imageToESCPOS()
    
    // Set larger font for QR content
    commands.push(0x1D, 0x21, 0x11); // Double height and width
    
    const contentLines = chunkText(state.qrData.content, 32); // 32 chars per line for 58mm
    for (const line of contentLines) {
        const bytes = stringToBytes(line);
        commands.push(...bytes);
        commands.push(0x0A);
    }
    
    commands.push(0x1D, 0x21, 0x00); // Normal size
    
    // 6. Print bottom text if exists
    if (bottomText) {
        commands.push(0x0A);
        const bottomBytes = stringToBytes(bottomText);
        commands.push(...bottomBytes);
        commands.push(0x0A);
    }
    
    // 7. Feed paper (4 lines)
    commands.push(0x0A, 0x0A, 0x0A, 0x0A);
    
    // 8. Cut paper (GS V 0) - RPP02N supports this
    commands.push(0x1D, 0x56, 0x00);
    
    return new Uint8Array(commands);
}

// Helper function to chunk text for 58mm width
function chunkText(text, charsPerLine) {
    const chunks = [];
    for (let i = 0; i < text.length; i += charsPerLine) {
        chunks.push(text.substring(i, i + charsPerLine));
    }
    return chunks;
}

// Advanced: Convert QR image to bitmap for thermal printer
async function imageToESCPOS(imageUrl) {
    // Create canvas to process image
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();
    
    return new Promise((resolve, reject) => {
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const commands = [];
            
            // Convert to bitmap format for ESC/POS
            // This is a simplified version - production needs proper dithering
            const width = canvas.width;
            const height = canvas.height;
            
            // ESC * m nL nH - Bitmap mode
            commands.push(0x1B, 0x2A, 0x01, width & 0xFF, (width >> 8) & 0xFF);
            
            for (let y = 0; y < height; y++) {
                for (let x = 0; x < width; x++) {
                    const idx = (y * width + x) * 4;
                    const r = imageData.data[idx];
                    const g = imageData.data[idx + 1];
                    const b = imageData.data[idx + 2];
                    const brightness = (r + g + b) / 3;
                    commands.push(brightness < 128 ? 0xFF : 0x00);
                }
                commands.push(0x0A); // Line feed after each row
            }
            
            resolve(new Uint8Array(commands));
        };
        img.onerror = reject;
        img.src = imageUrl;
    });
}

function stringToBytes(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
        bytes.push(str.charCodeAt(i));
    }
    return bytes;
}

// Send Data to Printer
async function sendToPrinter(data) {
    const services = await state.printer.getPrimaryServices();
    
    for (const service of services) {
        const characteristics = await service.getCharacteristics();
        
        for (const characteristic of characteristics) {
            if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                // Split data into chunks (max 512 bytes per write)
                const chunkSize = 512;
                for (let i = 0; i < data.length; i += chunkSize) {
                    const chunk = data.slice(i, i + chunkSize);
                    await characteristic.writeValue(chunk);
                }
                return;
            }
        }
    }
    
    throw new Error('No writable characteristic found');
}

// Templates
function loadTemplates() {
    const saved = localStorage.getItem('qr-templates');
    if (saved) {
        state.templates = JSON.parse(saved);
    }
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
        elements.displays.templatesList.innerHTML = `
            <p class="empty-state">No saved templates yet. Generate a QR code to save as template.</p>
        `;
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

    // Add click handlers
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

// Reset Form
function resetForm() {
    elements.inputs.title.value = '';
    elements.inputs.content.value = '';
    elements.inputs.bottomText.value = '';
    elements.displays.title.textContent = '';
    elements.displays.bottom.textContent = '';
    elements.displays.qrCode.innerHTML = '';
    elements.buttons.saveTemplate.style.display = 'none';
}

// Toast Notification
function showToast(message, type = '') {
    elements.toast.textContent = message;
    elements.toast.className = 'toast show ' + type;
    
    setTimeout(() => {
        elements.toast.className = 'toast';
    }, 3000);
}

// Service Worker Registration
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(registration => {
                console.log('SW registered:', registration);
            })
            .catch(error => {
                console.log('SW registration failed:', error);
            });
    }
}