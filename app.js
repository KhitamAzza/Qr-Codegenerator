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
// Replace the connectPrinter function in app.js with this:

async function connectPrinter() {
    if (!navigator.bluetooth) {
        showToast('Web Bluetooth not supported. Use Chrome on Android or Desktop.', 'error');
        return;
    }

    try {
        elements.displays.printerStatus.innerHTML = `
            <div class="loading"></div>
            <p>Select your printer from the list...</p>
        `;

        // FIX: Removed 'filters'. Using 'acceptAllDevices: true' is required for generic thermal printers
        const device = await navigator.bluetooth.requestDevice({
            acceptAllDevices: true,
            optionalServices: [
                '00001101-0000-1000-8000-00805f9b34fb', // Standard Serial Port Profile (SPP)
                '0000fff0-0000-1000-8000-00805f9b34fb', // Common thermal printer service
                '0000ffe0-0000-1000-8000-00805f9b34fb', // Another common thermal printer service
                'battery_service',
                'device_information'
            ]
        });

        state.printerDevice = device;
        
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
        // If user cancels the prompt, don't show an error toast
        if (error.name !== 'NotFoundError') {
            elements.displays.printerStatus.innerHTML = `
                <div class="status-icon">❌</div>
                <p>Connection failed. Please try again.</p>
            `;
            showToast('Failed to connect to printer', 'error');
        } else {
            elements.displays.printerStatus.innerHTML = `
                <div class="status-icon">🔍</div>
                <p>Searching for Bluetooth thermal printer...</p>
            `;
        }
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
    
    // 1. Initialize printer
    commands.push(0x1B, 0x40);
    
    // 2. Center align
    commands.push(0x1B, 0x61, 0x01);
    
    // 3. Print Title (Bold)
    if (title) {
        commands.push(0x1B, 0x45, 0x01); // Bold ON
        commands.push(...stringToBytes(title));
        commands.push(0x0A);
        commands.push(0x1B, 0x45, 0x00); // Bold OFF
    }
    
    commands.push(0x0A);
    
    // 4. Generate QR Code using the PRINTER'S built-in QR engine (Much more reliable!)
    const qrCommands = buildNativeQRCodeESCPOS(state.qrData.content);
    commands.push(...qrCommands);
    
    // 5. Print Bottom Text
    if (bottomText) {
        commands.push(0x0A, 0x0A);
        commands.push(...stringToBytes(bottomText));
        commands.push(0x0A);
    }
    
    // 6. Feed paper and Cut
    commands.push(0x0A, 0x0A, 0x0A, 0x0A);
    commands.push(0x1D, 0x56, 0x00); // Full cut
    
    return new Uint8Array(commands);
}
// Helper: Build native ESC/POS QR Code commands
function buildNativeQRCodeESCPOS(content) {
    const commands = [];
    const dataBytes = stringToBytes(content);
    const length = dataBytes.length + 3;
    const pL = length % 256;
    const pH = Math.floor(length / 256);

    // 1. Set QR Code size (4 = medium, perfect for 58mm paper)
    commands.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04);
    
    // 2. Set Error Correction (L = Low, maximizes space)
    commands.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31);
    
    // 3. Store QR Data in printer memory
    commands.push(0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30, ...dataBytes);
    
    // 4. Command printer to print the stored QR code
    commands.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
    
    return commands;
}

// Replace sendToPrinter in app.js with this robust version
async function sendToPrinter(data) {
    if (!state.printer) throw new Error("Printer not connected");
    
    const services = await state.printer.getPrimaryServices();
    
    // Known UUIDs for generic 58mm thermal printers (RPP02N, Xprinter, etc.)
    const targetServiceUUIDs = [
        'fff0', 'ffe0', '1101' 
    ];

    for (const service of services) {
        const serviceUuidShort = service.uuid.substring(4, 8).toLowerCase();
        
        // Prioritize known printer services
        const isTargetService = targetServiceUUIDs.includes(serviceUuidShort);
        
        if (isTargetService || true) { // Check all, but prioritize
            try {
                const characteristics = await service.getCharacteristics();
                for (const characteristic of characteristics) {
                    if (characteristic.properties.write || characteristic.properties.writeWithoutResponse) {
                        console.log('Found writable characteristic:', characteristic.uuid);
                        
                        // CRITICAL FIX: Chunk size reduced to 20 bytes. 
                        // Cheap Bluetooth modules crash if sent >20 bytes at once.
                        const chunkSize = 20; 
                        for (let i = 0; i < data.length; i += chunkSize) {
                            const chunk = data.slice(i, i + chunkSize);
                            await characteristic.writeValue(chunk);
                            
                            // CRITICAL FIX: 30ms delay between chunks prevents buffer overflow
                            await new Promise(resolve => setTimeout(resolve, 30)); 
                        }
                        return; // Success!
                    }
                }
            } catch (e) {
                console.warn('Could not read characteristics for service:', service.uuid, e);
            }
        }
    }
    
    throw new Error('No writable characteristic found. Printer may not be supported.');
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