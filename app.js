// Audio Context setup
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffers = new Map();

// Master trim in dB for global attenuation (default -3 dB)
let masterTrimDb = -3;
function dbToGain(db) {
    return Math.pow(10, db / 20);
}

// Load audio buffers
async function loadAudioBuffers() {
    for (const drum of drumSounds) {
        const response = await fetch(`sounds/${drum.id}.wav`);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        audioBuffers.set(drum.id, audioBuffer);
    }
}

// Key mapping: Q W E A S D
const keyMap = {
    'q': 'kick',
    'w': 'snare',
    'e': 'hihat',
    'a': 'clap',
    's': 'tom',
    'd': 'cymbal'
};

const drumSounds = [
    { label: 'Kick',    id: 'kick' },
    { label: 'Snare',   id: 'snare' },
    { label: 'Hi-Hat',  id: 'hihat' },
    { label: 'Clap',    id: 'clap' },
    { label: 'Tom',     id: 'tom' },
    { label: 'Cymbal',  id: 'cymbal' }
];

const NUM_STEPS = 16;

// Pattern storage
class Pattern {
    constructor(name = 'Pattern') {
        this.name = name;
        this.data = Array.from({ length: drumSounds.length }, () => Array(NUM_STEPS).fill(false));
    }

    copy() {
        const newPattern = new Pattern(this.name + ' Copy');
        newPattern.data = this.data.map(row => [...row]);
        return newPattern;
    }
}

// Patterns array and current pattern index
let patterns = [new Pattern('Pattern 1')];
let currentPatternIndex = 0;
let isChainMode = false;

// Getter/setter for current sequencer data
function getCurrentPattern() {
    return patterns[currentPatternIndex];
}

function getCurrentSequencerData() {
    return getCurrentPattern().data;
}

// Volume data: [drum], 0.0 to 1.0
let volumeData = Array(drumSounds.length).fill(0.8);

// Current step in sequencer
let currentStep = 0;
let isPlaying = false;
let intervalId = null;
let tempo = 120; // BPM

// --- Drum Pads (Finger Drumming)
function playSound(sound, time = 0) {
    if (audioBuffers.has(sound)) {
        const source = audioContext.createBufferSource();
        const gainNode = audioContext.createGain();
        source.buffer = audioBuffers.get(sound);
        
        // Set per-drum volume with master trim in dB
        const drumIdx = drumSounds.findIndex(d => d.id === sound);
        const baseGain = drumIdx !== -1 ? volumeData[drumIdx] : 0.8;
        gainNode.gain.value = baseGain * dbToGain(masterTrimDb);
        
        source.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        // Schedule the sound to play at the specified time
        source.start(time);
        
        // Highlight the pad (only for immediate playback)
        if (time === 0) {
            const pad = document.querySelector(`.drum-pad[data-sound="${sound}"]`);
            if (pad) {
                pad.classList.add('active');
                setTimeout(() => pad.classList.remove('active'), 120);
            }
        }
    }
}

document.querySelectorAll('.drum-pad').forEach(pad => {
    pad.addEventListener('click', () => {
        const sound = pad.getAttribute('data-sound');
        playSound(sound);
    });
});

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (keyMap[key]) {
        playSound(keyMap[key]);
    }
});

// --- Volume Controls
function renderVolumeControls() {
    const volumeDiv = document.getElementById('volume-controls');
    volumeDiv.innerHTML = '';
    // Master trim row
    const masterRow = document.createElement('div');
    masterRow.className = 'volume-row';
    const masterLabel = document.createElement('div');
    masterLabel.className = 'volume-label';
    masterLabel.textContent = 'Master';
    const masterSlider = document.createElement('input');
    masterSlider.type = 'range';
    masterSlider.min = -24;
    masterSlider.max = 0;
    masterSlider.step = 0.1;
    masterSlider.value = masterTrimDb;
    masterSlider.className = 'volume-slider';
    masterSlider.id = 'master-trim';
    const masterValue = document.createElement('span');
    masterValue.className = 'volume-value';
    masterValue.textContent = `${masterTrimDb} dB`;
    masterSlider.addEventListener('input', (e) => {
        masterTrimDb = parseFloat(e.target.value);
        masterValue.textContent = `${masterTrimDb} dB`;
    });
    masterRow.appendChild(masterLabel);
    masterRow.appendChild(masterSlider);
    masterRow.appendChild(masterValue);
    volumeDiv.appendChild(masterRow);
    drumSounds.forEach((drum, idx) => {
        const row = document.createElement('div');
        row.className = 'volume-row';
        // Label
        const label = document.createElement('div');
        label.className = 'volume-label';
        label.textContent = drum.label;
        // Slider
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = 0;
        slider.max = 1;
        slider.step = 0.01;
        slider.value = volumeData[idx];
        slider.className = 'volume-slider';
        slider.id = `volume-slider-${drum.id}`;
        // Value display
        const valueSpan = document.createElement('span');
        valueSpan.className = 'volume-value';
        valueSpan.textContent = Math.round(volumeData[idx] * 100);

        slider.addEventListener('input', (e) => {
            volumeData[idx] = parseFloat(e.target.value);
            valueSpan.textContent = Math.round(volumeData[idx] * 100);
        });

        row.appendChild(label);
        row.appendChild(slider);
        row.appendChild(valueSpan);
        volumeDiv.appendChild(row);
    });
}
renderVolumeControls();

// --- Sequencer Rendering
// Pattern management UI
function renderPatternControls() {
    const controlsDiv = document.getElementById('pattern-controls');
    if (!controlsDiv) return;

    // Create pattern number indicators
    const patternNumbers = patterns.map((p, idx) => 
        `<span class="pattern-number${idx === currentPatternIndex ? ' current' : ''}">${idx + 1}</span>`
    ).join('');

    controlsDiv.innerHTML = `
        <div class="pattern-numbers${isChainMode ? ' chain-mode' : ''}">
            ${patternNumbers}
        </div>
        <div class="pattern-selector">
            <button id="prev-pattern">&lt;</button>
            <span id="pattern-name">${getCurrentPattern().name}</span>
            <button id="next-pattern">&gt;</button>
        </div>
        <div class="pattern-actions">
            <button id="new-pattern">New</button>
            <button id="copy-pattern">Copy</button>
            <button id="delete-pattern">Delete</button>
        </div>
    `;

    // Pattern navigation
    document.getElementById('prev-pattern').addEventListener('click', () => {
        if (currentPatternIndex > 0) {
            currentPatternIndex--;
            renderPatternControls();
            renderSequencer();
        }
    });

    document.getElementById('next-pattern').addEventListener('click', () => {
        if (currentPatternIndex < patterns.length - 1) {
            currentPatternIndex++;
            renderPatternControls();
            renderSequencer();
        }
    });

    // Pattern management
    document.getElementById('new-pattern').addEventListener('click', () => {
        patterns.push(new Pattern(`Pattern ${patterns.length + 1}`));
        currentPatternIndex = patterns.length - 1;
        renderPatternControls();
        renderSequencer();
    });

    document.getElementById('copy-pattern').addEventListener('click', () => {
        const newPattern = getCurrentPattern().copy();
        patterns.splice(currentPatternIndex + 1, 0, newPattern);
        currentPatternIndex++;
        renderPatternControls();
        renderSequencer();
    });

    document.getElementById('delete-pattern').addEventListener('click', () => {
        if (patterns.length > 1) {
            patterns.splice(currentPatternIndex, 1);
            if (currentPatternIndex >= patterns.length) {
                currentPatternIndex = patterns.length - 1;
            }
            renderPatternControls();
            renderSequencer();
        }
    });
}

function renderSequencer() {
    const sequencerDiv = document.getElementById('sequencer');
    sequencerDiv.innerHTML = '';
    renderPatternControls(); // Update pattern controls
    drumSounds.forEach((drum, rowIdx) => {
        const row = document.createElement('div');
        row.className = 'sequencer-row';

        const label = document.createElement('div');
        label.className = 'sequencer-label';
        label.textContent = drum.label;

        const stepsDiv = document.createElement('div');
        stepsDiv.className = 'steps';

        for (let step = 0; step < NUM_STEPS; step++) {
            const btn = document.createElement('button');
            btn.className = 'step';
            if (getCurrentSequencerData()[rowIdx][step]) btn.classList.add('active');
            if (step === currentStep && isPlaying) btn.classList.add('current');
            btn.addEventListener('click', () => {
                getCurrentSequencerData()[rowIdx][step] = !getCurrentSequencerData()[rowIdx][step];
                renderSequencer();
            });
            stepsDiv.appendChild(btn);
        }

        row.appendChild(label);
        row.appendChild(stepsDiv);
        sequencerDiv.appendChild(row);
    });
}
renderSequencer();

// --- Sequencer Logic
let nextStepTime = 0;
let lookaheadTime = 0.1; // Look 100ms ahead
let scheduleAheadTime = 0.2; // Schedule 200ms ahead

function nextNote() {
    const secondsPerBeat = 60.0 / tempo;
    const secondsPerStep = secondsPerBeat / 4; // 16th notes
    nextStepTime += secondsPerStep;
    currentStep = (currentStep + 1) % NUM_STEPS;
    
    // In chain mode, move to next pattern when current pattern ends
    if (isChainMode && currentStep === 0) {
        currentPatternIndex = (currentPatternIndex + 1) % patterns.length;
        renderPatternControls();
    }
}

function scheduleNote(stepTime) {
    // In chain mode, highlight the current pattern
    if (isChainMode) {
        document.querySelectorAll('.pattern-number').forEach((el, idx) => {
            el.classList.toggle('current', idx === currentPatternIndex);
        });
    }
    
    drumSounds.forEach((drum, rowIdx) => {
        if (getCurrentSequencerData()[rowIdx][currentStep]) {
            playSound(drum.id, stepTime);
        }
    });
}

function scheduler() {
    while (nextStepTime < audioContext.currentTime + scheduleAheadTime) {
        scheduleNote(nextStepTime);
        nextNote();
    }
    renderSequencer();
    if (isPlaying) {
        requestAnimationFrame(scheduler);
    }
}

// --- Controls
function startSequencer() {
    if (!isPlaying) {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        isPlaying = true;
        currentStep = 0;
        nextStepTime = audioContext.currentTime;
        scheduler();
        renderSequencer();
    }
}

function stopSequencer() {
    if (isPlaying) {
        isPlaying = false;
        currentStep = 0;
        renderSequencer();
    }
}

document.getElementById('play-btn').addEventListener('click', () => {
    if (isPlaying) {
        stopSequencer();
        document.getElementById('play-btn').textContent = "Play";
    } else {
        startSequencer();
        document.getElementById('play-btn').textContent = "Stop";
    }
});

document.getElementById('tempo').addEventListener('input', (e) => {
    tempo = parseInt(e.target.value, 10);
    document.getElementById('tempo-value').textContent = tempo;
});

// Chain mode toggle
document.getElementById('chain-btn').addEventListener('click', () => {
    isChainMode = !isChainMode;
    document.getElementById('chain-btn').textContent = `Chain Mode: ${isChainMode ? 'On' : 'Off'}`;
    document.getElementById('pattern-controls').classList.toggle('chain-mode', isChainMode);
    renderPatternControls();
});

// Initialize audio on page load
loadAudioBuffers().then(() => {
    console.log('Audio buffers loaded successfully');
}).catch(error => {
    console.error('Error loading audio buffers:', error);
});