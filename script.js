/* ========================================
   ULTIMATE GAMEPAD TESTER - JAVASCRIPT
   Gamepad API Implementation with Advanced Analytics
   ======================================== */

// ==========================================
// GLOBAL STATE MANAGEMENT
// ==========================================

const GamepadTester = {
    // Connected gamepads storage
    gamepads: {},
    
    // Currently active gamepad index
    activeGamepadIndex: null,
    
    // Animation frame ID for cancellation
    animationFrameId: null,
    
    // Performance tracking
    performance: {
        lastTimestamp: 0,
        frameDeltas: [],
        pollingRates: []
    },
    
    // Trigger sensitivity tracking
    // We track unique values to determine sensor resolution (8-bit = 255 steps, 10-bit = 1023 steps, etc.)
    triggerTracking: {
        left: new Set(),
        right: new Set()
    },
    
    // Oscilloscope data (for graphing stick movement over time)
    oscilloscopeData: {
        left: { x: [], y: [] },
        right: { x: [], y: [] },
        maxPoints: 200, // Keep last 200 data points
        timeOffset: 0
    },
    
    // Circularity test data (for dead zone visualization)
    circularityData: {
        left: [],
        right: [],
        maxPoints: 1000
    },
    
    // Selected axes for visualization
    selectedScope: 'left',
    selectedCircle: 'left'
};

// ==========================================
// STANDARD GAMEPAD BUTTON MAPPING (W3C)
// ==========================================

const BUTTON_MAPPING = {
    0: 'A / Cross',
    1: 'B / Circle',
    2: 'X / Square',
    3: 'Y / Triangle',
    4: 'LB / L1',
    5: 'RB / R1',
    6: 'LT / L2',
    7: 'RT / R2',
    8: 'Select / Share',
    9: 'Start / Options',
    10: 'L3 (Left Stick)',
    11: 'R3 (Right Stick)',
    12: 'D-Pad Up',
    13: 'D-Pad Down',
    14: 'D-Pad Left',
    15: 'D-Pad Right',
    16: 'Home / Guide',
    17: 'Touchpad / Misc'
};

// Axis mapping
const AXIS_MAPPING = {
    0: 'Left Stick X',
    1: 'Left Stick Y',
    2: 'Right Stick X',
    3: 'Right Stick Y'
};

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

function initializeApp() {
    // Check for Gamepad API support
    if (!navigator.getGamepads) {
        showCompatibilityModal();
        return;
    }
    
    console.log('🎮 Ultimate Gamepad Tester initialized');
    
    // Set up event listeners
    setupEventListeners();
    
    // Set up canvas contexts
    setupCanvases();
    
    // Start the polling loop
    startPolling();
    
    // Check for already connected gamepads (in case they were connected before page load)
    checkExistingGamepads();
}

// ==========================================
// EVENT LISTENER SETUP
// ==========================================

function setupEventListeners() {
    // Gamepad connection events
    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    
    // Oscilloscope controls
    document.querySelectorAll('input[name="scope-axis"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            GamepadTester.selectedScope = e.target.value;
        });
    });
    
    document.getElementById('clear-scope').addEventListener('click', clearOscilloscope);
    
    // Circularity controls
    document.querySelectorAll('input[name="circle-axis"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            GamepadTester.selectedCircle = e.target.value;
            clearCircularity();
        });
    });
    
    document.getElementById('clear-circle').addEventListener('click', clearCircularity);
    
    // Vibration controls
    setupVibrationControls();
}

// ==========================================
// GAMEPAD CONNECTION HANDLERS
// ==========================================

function handleGamepadConnected(event) {
    const gamepad = event.gamepad;
    console.log('🎮 Gamepad connected:', gamepad);
    
    // Store the gamepad
    GamepadTester.gamepads[gamepad.index] = gamepad;
    
    // If this is the first gamepad, make it active
    if (GamepadTester.activeGamepadIndex === null) {
        GamepadTester.activeGamepadIndex = gamepad.index;
    }
    
    // Update UI
    updateConnectionStatus(true);
    showAppContent();
    createControllerTabs();
    
    // Show toast notification
    showToast(`Controller Connected: ${gamepad.id}`, 'success');
    
    // Check vibration support
    checkVibrationSupport(gamepad);
}

function handleGamepadDisconnected(event) {
    const gamepad = event.gamepad;
    console.log('🎮 Gamepad disconnected:', gamepad);
    
    // Remove the gamepad
    delete GamepadTester.gamepads[gamepad.index];
    
    // Show toast notification
    showToast(`Controller Disconnected: ${gamepad.id}`, 'error');
    
    // If the active gamepad was disconnected, switch to another or hide UI
    if (GamepadTester.activeGamepadIndex === gamepad.index) {
        const remainingGamepads = Object.keys(GamepadTester.gamepads);
        
        if (remainingGamepads.length > 0) {
            GamepadTester.activeGamepadIndex = parseInt(remainingGamepads[0]);
        } else {
            GamepadTester.activeGamepadIndex = null;
            hideAppContent();
            updateConnectionStatus(false);
        }
    }
    
    // Update tabs
    createControllerTabs();
}

function checkExistingGamepads() {
    // Some browsers don't fire connection events for already-connected gamepads
    // So we manually check on page load
    const gamepads = navigator.getGamepads();
    
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) {
            handleGamepadConnected({ gamepad: gamepads[i] });
        }
    }
}

// ==========================================
// UI UPDATE FUNCTIONS
// ==========================================

function updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    const messageElement = statusElement.querySelector('p');
    
    if (connected) {
        statusElement.classList.add('connected');
        messageElement.textContent = 'Controller Connected - Ready for Testing';
    } else {
        statusElement.classList.remove('connected');
        messageElement.textContent = 'No controller detected. Press any button on your gamepad to connect.';
    }
}

function showAppContent() {
    document.getElementById('app-content').classList.remove('hidden');
}

function hideAppContent() {
    document.getElementById('app-content').classList.add('hidden');
}

function createControllerTabs() {
    const tabContainer = document.getElementById('controller-tabs');
    const gamepadIndices = Object.keys(GamepadTester.gamepads);
    
    if (gamepadIndices.length === 0) {
        tabContainer.classList.add('hidden');
        return;
    }
    
    if (gamepadIndices.length === 1) {
        // Only one controller, no need for tabs
        tabContainer.classList.add('hidden');
        return;
    }
    
    // Multiple controllers - show tabs
    tabContainer.classList.remove('hidden');
    tabContainer.innerHTML = '';
    
    gamepadIndices.forEach(index => {
        const tab = document.createElement('div');
        tab.className = 'controller-tab';
        tab.textContent = `Controller ${parseInt(index) + 1}`;
        
        if (parseInt(index) === GamepadTester.activeGamepadIndex) {
            tab.classList.add('active');
        }
        
        tab.addEventListener('click', () => {
            GamepadTester.activeGamepadIndex = parseInt(index);
            createControllerTabs();
            
            // Reset trigger tracking when switching controllers
            GamepadTester.triggerTracking.left.clear();
            GamepadTester.triggerTracking.right.clear();
        });
        
        tabContainer.appendChild(tab);
    });
}

// ==========================================
// MAIN POLLING LOOP
// ==========================================

function startPolling() {
    function pollGamepads(timestamp) {
        // Get current gamepad state
        // IMPORTANT: navigator.getGamepads() returns a NEW snapshot each time
        // We must call this in every frame to get live data
        const gamepads = navigator.getGamepads();
        
        // Update our stored gamepads with fresh data
        for (let i = 0; i < gamepads.length; i++) {
            if (gamepads[i]) {
                GamepadTester.gamepads[gamepads[i].index] = gamepads[i];
            }
        }
        
        // Process the active gamepad
        if (GamepadTester.activeGamepadIndex !== null && 
            GamepadTester.gamepads[GamepadTester.activeGamepadIndex]) {
            
            const gamepad = GamepadTester.gamepads[GamepadTester.activeGamepadIndex];
            
            // Update performance metrics
            updatePerformanceMetrics(timestamp, gamepad.timestamp);
            
            // Update visual representation
            updateVisualController(gamepad);
            
            // Update raw data table
            updateRawDataTable(gamepad);
            
            // Update controller info
            updateControllerInfo(gamepad);
            
            // Update trigger pressure visualization
            updateTriggerPressure(gamepad);
            
            // Update oscilloscope
            updateOscilloscope(gamepad, timestamp);
            
            // Update circularity test
            updateCircularity(gamepad);
        }
        
        // Continue the loop
        GamepadTester.animationFrameId = requestAnimationFrame(pollGamepads);
    }
    
    // Start the loop
    GamepadTester.animationFrameId = requestAnimationFrame(pollGamepads);
}

// ==========================================
// PERFORMANCE METRICS
// ==========================================

function updatePerformanceMetrics(currentTime, gamepadTimestamp) {
    const lastTime = GamepadTester.performance.lastTimestamp;
    
    if (lastTime > 0) {
        // Calculate frame delta (time between frames in milliseconds)
        const frameDelta = currentTime - lastTime;
        GamepadTester.performance.frameDeltas.push(frameDelta);
        
        // Keep only last 60 frames for averaging
        if (GamepadTester.performance.frameDeltas.length > 60) {
            GamepadTester.performance.frameDeltas.shift();
        }
        
        // Calculate average frame delta
        const avgFrameDelta = GamepadTester.performance.frameDeltas.reduce((a, b) => a + b, 0) / 
                              GamepadTester.performance.frameDeltas.length;
        
        // Calculate polling rate in Hz
        // Polling rate = 1000ms / average frame delta
        const pollingRate = 1000 / avgFrameDelta;
        GamepadTester.performance.pollingRates.push(pollingRate);
        
        // Keep only last 60 samples
        if (GamepadTester.performance.pollingRates.length > 60) {
            GamepadTester.performance.pollingRates.shift();
        }
        
        // Calculate average polling rate
        const avgPollingRate = GamepadTester.performance.pollingRates.reduce((a, b) => a + b, 0) / 
                               GamepadTester.performance.pollingRates.length;
        
        // Update UI
        document.getElementById('polling-rate').textContent = `${Math.round(avgPollingRate)} Hz`;
        document.getElementById('frame-delta').textContent = `${avgFrameDelta.toFixed(2)} ms`;
    }
    
    GamepadTester.performance.lastTimestamp = currentTime;
    
    // Update timestamp display (using gamepad's internal timestamp)
    document.getElementById('timestamp-display').textContent = gamepadTimestamp.toFixed(2);
}

// ==========================================
// VISUAL CONTROLLER UPDATE
// ==========================================

function updateVisualController(gamepad) {
    // Update buttons
    gamepad.buttons.forEach((button, index) => {
        const buttonElement = document.querySelector(`[data-button="${index}"]`);
        if (buttonElement) {
            // A button is "pressed" when its value > 0.5 or pressed property is true
            if (button.pressed || button.value > 0.5) {
                buttonElement.classList.add('active');
            } else {
                buttonElement.classList.remove('active');
            }
        }
    });
    
    // Update analog sticks
    // Apply a small deadzone (0.05) to prevent drift on worn controllers
    const DEADZONE = 0.05;
    
    // Left stick (axes 0 and 1)
    let leftX = Math.abs(gamepad.axes[0]) > DEADZONE ? gamepad.axes[0] : 0;
    let leftY = Math.abs(gamepad.axes[1]) > DEADZONE ? gamepad.axes[1] : 0;
    
    // Right stick (axes 2 and 3)
    let rightX = Math.abs(gamepad.axes[2]) > DEADZONE ? gamepad.axes[2] : 0;
    let rightY = Math.abs(gamepad.axes[3]) > DEADZONE ? gamepad.axes[3] : 0;
    
    // Update stick positions
    // Each stick can move ±15px from center (adjust based on .stick-outer size)
    const stickRange = 15;
    
    const leftStick = document.getElementById('stick-left');
    leftStick.style.transform = `translate(${leftX * stickRange}px, ${leftY * stickRange}px)`;
    
    const rightStick = document.getElementById('stick-right');
    rightStick.style.transform = `translate(${rightX * stickRange}px, ${rightY * stickRange}px)`;
    
    // Update triggers (buttons 6 and 7, or axes on some controllers)
    // Standard mapping: LT = button[6], RT = button[7]
    const leftTrigger = gamepad.buttons[6] ? gamepad.buttons[6].value : 0;
    const rightTrigger = gamepad.buttons[7] ? gamepad.buttons[7].value : 0;
    
    document.getElementById('trigger-left-fill').style.height = `${leftTrigger * 100}%`;
    document.getElementById('trigger-left-value').textContent = leftTrigger.toFixed(2);
    
    document.getElementById('trigger-right-fill').style.height = `${rightTrigger * 100}%`;
    document.getElementById('trigger-right-value').textContent = rightTrigger.toFixed(2);
}

// ==========================================
// RAW DATA TABLE
// ==========================================

function updateRawDataTable(gamepad) {
    const tableBody = document.getElementById('raw-data-table');
    let html = '';
    
    // Axes
    gamepad.axes.forEach((value, index) => {
        const name = AXIS_MAPPING[index] || `Axis ${index}`;
        const formattedValue = value.toFixed(5);
        const state = Math.abs(value) > 0.05 ? 'Active' : 'Neutral';
        
        html += `
            <tr>
                <td class="input-name">${name}</td>
                <td class="input-value">${formattedValue}</td>
                <td class="input-state">${state}</td>
            </tr>
        `;
    });
    
    // Buttons
    gamepad.buttons.forEach((button, index) => {
        const name = BUTTON_MAPPING[index] || `Button ${index}`;
        const formattedValue = button.value.toFixed(5);
        const state = button.pressed ? 'Pressed' : 'Released';
        
        html += `
            <tr>
                <td class="input-name">${name}</td>
                <td class="input-value">${formattedValue}</td>
                <td class="input-state">${state}</td>
            </tr>
        `;
    });
    
    tableBody.innerHTML = html;
}

// ==========================================
// CONTROLLER INFO
// ==========================================

function updateControllerInfo(gamepad) {
    document.getElementById('controller-name').textContent = gamepad.id;
    document.getElementById('controller-mapping').textContent = gamepad.mapping || 'Unknown';
}

// ==========================================
// TRIGGER PRESSURE ANALYZER
// ==========================================

function updateTriggerPressure(gamepad) {
    // Get trigger values
    const leftTrigger = gamepad.buttons[6] ? gamepad.buttons[6].value : 0;
    const rightTrigger = gamepad.buttons[7] ? gamepad.buttons[7].value : 0;
    
    // Update pressure bars
    document.getElementById('pressure-bar-left').style.width = `${leftTrigger * 100}%`;
    document.getElementById('pressure-label-left').textContent = leftTrigger.toFixed(5);
    
    document.getElementById('pressure-bar-right').style.width = `${rightTrigger * 100}%`;
    document.getElementById('pressure-label-right').textContent = rightTrigger.toFixed(5);
    
    // Track unique values for resolution calculation
    // This helps determine if the controller uses 8-bit (255 steps), 10-bit (1023 steps), or higher resolution
    if (leftTrigger > 0) {
        GamepadTester.triggerTracking.left.add(leftTrigger);
    }
    if (rightTrigger > 0) {
        GamepadTester.triggerTracking.right.add(rightTrigger);
    }
    
    // Update resolution display
    const leftSteps = GamepadTester.triggerTracking.left.size;
    const rightSteps = GamepadTester.triggerTracking.right.size;
    
    document.getElementById('resolution-left').textContent = leftSteps > 0 ? `~${leftSteps} steps` : '- steps';
    document.getElementById('resolution-right').textContent = rightSteps > 0 ? `~${rightSteps} steps` : '- steps';
}

// ==========================================
// CANVAS SETUP
// ==========================================

function setupCanvases() {
    // Oscilloscope canvas
    const oscCanvas = document.getElementById('oscilloscope-canvas');
    const oscCtx = oscCanvas.getContext('2d');
    oscCtx.imageSmoothingEnabled = false;
    
    // Circularity canvas
    const circCanvas = document.getElementById('circularity-canvas');
    const circCtx = circCanvas.getContext('2d');
    circCtx.imageSmoothingEnabled = false;
    
    // Draw initial state
    drawOscilloscopeGrid(oscCtx, oscCanvas.width, oscCanvas.height);
    drawCircularityGrid(circCtx, circCanvas.width, circCanvas.height);
}

// ==========================================
// OSCILLOSCOPE (Analog Stick Tracking)
// ==========================================

function updateOscilloscope(gamepad, timestamp) {
    const canvas = document.getElementById('oscilloscope-canvas');
    const ctx = canvas.getContext('2d');
    
    // Determine which stick to track
    const axisOffset = GamepadTester.selectedScope === 'left' ? 0 : 2;
    const xValue = gamepad.axes[axisOffset];
    const yValue = gamepad.axes[axisOffset + 1];
    
    // Add data points
    const data = GamepadTester.oscilloscopeData[GamepadTester.selectedScope];
    
    data.x.push(xValue);
    data.y.push(yValue);
    
    // Limit array size
    if (data.x.length > GamepadTester.oscilloscopeData.maxPoints) {
        data.x.shift();
        data.y.shift();
    }
    
    // Redraw
    drawOscilloscopeGraph(ctx, canvas.width, canvas.height, data);
}

function drawOscilloscopeGrid(ctx, width, height) {
    // Clear
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, width, height);
    
    // Grid lines
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Horizontal lines
    for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
    
    // Vertical lines
    for (let i = 0; i <= 10; i++) {
        const x = (width / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    
    // Center line (0 value)
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    
    // Labels
    ctx.fillStyle = '#a0a0a8';
    ctx.font = '12px Share Tech Mono';
    ctx.fillText('+1.0', 10, 20);
    ctx.fillText('0.0', 10, height / 2 - 10);
    ctx.fillText('-1.0', 10, height - 10);
}

function drawOscilloscopeGraph(ctx, width, height, data) {
    // Redraw grid
    drawOscilloscopeGrid(ctx, width, height);
    
    if (data.x.length < 2) return;
    
    // Calculate scale
    const pointSpacing = width / GamepadTester.oscilloscopeData.maxPoints;
    const midY = height / 2;
    const scale = height / 2; // Map -1 to 1 range to canvas height
    
    // Draw X-axis line (Cyan)
    ctx.strokeStyle = '#00f3ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < data.x.length; i++) {
        const x = width - ((data.x.length - i) * pointSpacing);
        const y = midY - (data.x[i] * scale);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    
    // Draw Y-axis line (Pink)
    ctx.strokeStyle = '#ff00ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < data.y.length; i++) {
        const x = width - ((data.y.length - i) * pointSpacing);
        const y = midY - (data.y[i] * scale);
        
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.stroke();
    
    // Legend
    ctx.fillStyle = '#00f3ff';
    ctx.fillText('X-Axis', width - 70, 20);
    ctx.fillStyle = '#ff00ff';
    ctx.fillText('Y-Axis', width - 70, 40);
}

function clearOscilloscope() {
    GamepadTester.oscilloscopeData.left = { x: [], y: [] };
    GamepadTester.oscilloscopeData.right = { x: [], y: [] };
    
    const canvas = document.getElementById('oscilloscope-canvas');
    const ctx = canvas.getContext('2d');
    drawOscilloscopeGrid(ctx, canvas.width, canvas.height);
}

// ==========================================
// CIRCULARITY TEST (Dead Zone Visualization)
// ==========================================

function updateCircularity(gamepad) {
    const canvas = document.getElementById('circularity-canvas');
    const ctx = canvas.getContext('2d');
    
    // Determine which stick to track
    const axisOffset = GamepadTester.selectedCircle === 'left' ? 0 : 2;
    const xValue = gamepad.axes[axisOffset];
    const yValue = gamepad.axes[axisOffset + 1];
    
    // Only add point if stick is moved significantly
    if (Math.abs(xValue) > 0.1 || Math.abs(yValue) > 0.1) {
        const data = GamepadTester.circularityData[GamepadTester.selectedCircle];
        data.push({ x: xValue, y: yValue });
        
        // Limit points
        if (data.length > GamepadTester.circularityData.maxPoints) {
            data.shift();
        }
    }
    
    // Redraw
    drawCircularityTest(ctx, canvas.width, canvas.height);
}

function drawCircularityGrid(ctx, width, height) {
    // Clear
    ctx.fillStyle = '#0f0f12';
    ctx.fillRect(0, 0, width, height);
    
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 2 - 20;
    
    // Draw grid
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.1)';
    ctx.lineWidth = 1;
    
    // Vertical and horizontal center lines
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.stroke();
    
    // Perfect circle overlay (ideal stick movement)
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
    
    // Square boundary (maximum stick range)
    ctx.strokeStyle = 'rgba(255, 0, 255, 0.2)';
    ctx.strokeRect(20, 20, width - 40, height - 40);
    
    // Labels
    ctx.fillStyle = '#a0a0a8';
    ctx.font = '12px Share Tech Mono';
    ctx.fillText('+1', centerX + 5, 25);
    ctx.fillText('-1', centerX + 5, height - 10);
    ctx.fillText('-1', 10, centerY - 5);
    ctx.fillText('+1', width - 30, centerY - 5);
}

function drawCircularityTest(ctx, width, height) {
    // Redraw grid
    drawCircularityGrid(ctx, width, height);
    
    const data = GamepadTester.circularityData[GamepadTester.selectedCircle];
    if (data.length === 0) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = (Math.min(width, height) / 2 - 20);
    
    // Draw data points
    ctx.fillStyle = '#00ff88';
    
    data.forEach(point => {
        const x = centerX + (point.x * scale);
        const y = centerY + (point.y * scale);
        
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Calculate circularity error
    // This measures how much the actual input deviates from a perfect circle
    if (data.length > 10) {
        let totalError = 0;
        
        data.forEach(point => {
            const distance = Math.sqrt(point.x * point.x + point.y * point.y);
            // Error is the difference from 1.0 (perfect circle edge)
            if (distance > 0.5) { // Only check points far from center
                const error = Math.abs(distance - 1.0);
                totalError += error;
            }
        });
        
        const avgError = (totalError / data.length) * 100;
        document.getElementById('circularity-error').textContent = `${avgError.toFixed(2)}%`;
    }
}

function clearCircularity() {
    GamepadTester.circularityData.left = [];
    GamepadTester.circularityData.right = [];
    
    const canvas = document.getElementById('circularity-canvas');
    const ctx = canvas.getContext('2d');
    drawCircularityGrid(ctx, canvas.width, canvas.height);
    
    document.getElementById('circularity-error').textContent = '0.00%';
}

// ==========================================
// VIBRATION / HAPTICS CONTROL
// ==========================================

function setupVibrationControls() {
    // Update slider value displays
    document.getElementById('weak-magnitude').addEventListener('input', (e) => {
        document.getElementById('weak-value').textContent = parseFloat(e.target.value).toFixed(2);
    });
    
    document.getElementById('strong-magnitude').addEventListener('input', (e) => {
        document.getElementById('strong-value').textContent = parseFloat(e.target.value).toFixed(2);
    });
    
    document.getElementById('duration').addEventListener('input', (e) => {
        document.getElementById('duration-value').textContent = e.target.value;
    });
    
    // Test vibration button
    document.getElementById('test-vibration').addEventListener('click', testVibration);
}

function checkVibrationSupport(gamepad) {
    const notice = document.getElementById('vibration-notice');
    const sliders = document.getElementById('vibration-sliders');
    
    // Check if vibration is supported
    // Modern API: gamepad.vibrationActuator
    // Older API: gamepad.hapticActuators
    if (gamepad.vibrationActuator || gamepad.hapticActuators) {
        notice.style.display = 'none';
        sliders.style.display = 'flex';
    } else {
        notice.textContent = '⚠️ This controller does not support vibration, or your browser does not support the Gamepad Haptics API.';
        notice.style.display = 'block';
        sliders.style.display = 'none';
    }
}

function testVibration() {
    if (GamepadTester.activeGamepadIndex === null) {
        showToast('No active gamepad', 'error');
        return;
    }
    
    // Get fresh gamepad state
    const gamepads = navigator.getGamepads();
    const gamepad = gamepads[GamepadTester.activeGamepadIndex];
    
    if (!gamepad) {
        showToast('Gamepad not found', 'error');
        return;
    }
    
    // Get user settings
    const weakMagnitude = parseFloat(document.getElementById('weak-magnitude').value);
    const strongMagnitude = parseFloat(document.getElementById('strong-magnitude').value);
    const duration = parseInt(document.getElementById('duration').value);
    
    // Try modern API first (vibrationActuator)
    if (gamepad.vibrationActuator) {
        gamepad.vibrationActuator.playEffect('dual-rumble', {
            startDelay: 0,
            duration: duration,
            weakMagnitude: weakMagnitude,
            strongMagnitude: strongMagnitude
        }).then(() => {
            showToast('Vibration test completed', 'success');
        }).catch(error => {
            console.error('Vibration error:', error);
            showToast('Vibration test failed', 'error');
        });
    }
    // Try older API (hapticActuators)
    else if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
        gamepad.hapticActuators[0].pulse(strongMagnitude, duration).then(() => {
            showToast('Vibration test completed', 'success');
        }).catch(error => {
            console.error('Vibration error:', error);
            showToast('Vibration test failed', 'error');
        });
    } else {
        showToast('Vibration not supported on this controller', 'error');
    }
}

// ==========================================
// TOAST NOTIFICATION SYSTEM
// ==========================================

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    container.appendChild(toast);
    
    // Auto-remove after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ==========================================
// COMPATIBILITY MODAL
// ==========================================

function showCompatibilityModal() {
    document.getElementById('compatibility-modal').classList.remove('hidden');
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Clamp a value between min and max
function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// Linear interpolation
function lerp(start, end, amount) {
    return start + (end - start) * amount;
}

// ==========================================
// CONSOLE GREETING
// ==========================================

console.log('%c🎮 Ultimate Gamepad Tester', 'color: #00f3ff; font-size: 24px; font-weight: bold;');
console.log('%cProfessional Controller Diagnostics', 'color: #ff00ff; font-size: 14px;');
console.log('%cConnect your gamepad and press any button to begin testing.', 'color: #a0a0a8; font-size: 12px;');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #00f3ff;');
