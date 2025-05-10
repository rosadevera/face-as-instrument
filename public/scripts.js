// ========== GLOBAL VARIABLES ==========
// Face tracking
let lastEmotion = '';
const logLimit = 20;

// Tone.js audio
let isHappyLoopPlaying = false;
let happyLoop;
let isPlayingSadLoop = false;
let sadLoop;
const winkSynth = new Tone.MembraneSynth().toDestination();
let winkLoop = new Tone.Loop((time) => {
    winkSynth.triggerAttackRelease("C2", "8n", time);
}, "2n"); 

// Additional audio effects
let surpriseEffect, tiltFilter, mouthSynth, blinkSynth, angryDistortion;

// Visualizer
let analyser, waveformCanvas, waveformCtx;


// ========== INITIALIZATION ==========
document.body.addEventListener('click', async () => {
    await Tone.start();
    console.log('Audio context started');
});

const volumeSlider = document.getElementById('volume-slider');
volumeSlider.addEventListener('input', () => {
    const volume = parseInt(volumeSlider.value);
    Tone.Destination.volume.value = volume;
});

// About popup handlers
document.getElementById('about').addEventListener('click', function() {
    document.getElementById('aboutpopup').classList.add('active');
});

document.getElementById('closeAbout').addEventListener('click', function() {
    document.getElementById('aboutpopup').classList.remove('active');
});

document.getElementById('aboutpopup').addEventListener('click', function(e) {
    if (e.target === this) {
        this.classList.remove('active');
    }
});


// ========== FACE DETECTION & AUDIO ==========
const run = async() => {
    // Initialize camera
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const videoFeedEl = document.getElementById('video-feed');
    videoFeedEl.srcObject = stream;

    // Load face-api models
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('./models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
        faceapi.nets.ageGenderNet.loadFromUri('./models'),
        faceapi.nets.faceExpressionNet.loadFromUri('./models'),
    ]);

    // Setup canvas
    const canvas = document.getElementById('canvas');
    canvas.style.left = videoFeedEl.offsetLeft;
    canvas.style.top = videoFeedEl.offsetTop;
    canvas.height = videoFeedEl.height;
    canvas.width = videoFeedEl.width;

    // Initialize audio
    await Tone.start();
    console.log('Audio context started');
    setupVisualizer(); // Initialize visualizer first
    setupAdditionalAudio();

    // Start face detection loop
    setInterval(async() => {
        console.log("Running face detection...");
        let faceAIData = await faceapi.detectAllFaces(videoFeedEl)
            .withFaceLandmarks()
            .withFaceDescriptors()
            .withAgeAndGender()
            .withFaceExpressions();

        console.log("Faces detected:", faceAIData.length);

        // Draw face landmarks
        canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
        faceAIData = faceapi.resizeResults(faceAIData, videoFeedEl);
        drawFaceLandmarks(canvas, faceAIData);

        // Process facial expressions
        if (faceAIData.length > 0) {
            const mainFace = faceAIData[0];
            updateEmotionLog(mainFace);
            updateMouthDisplay(mainFace);
            updateEyeDisplay(mainFace);  
            handleSadExpression(faceAIData);
            
            // New facial controls
            handleMouthOpen(mainFace);
            handleHeadTilt(mainFace);
            handleBlink(mainFace);
            handleAngry(mainFace);
            handleSurprised(mainFace);
            handleDisgusted(mainFace);
        }
    }, 200);
}

// ========== AUDIO FUNCTIONS ==========
// ========== AUDIO FIXES ==========

// Initialize all audio components properly
function setupAdditionalAudio() {
    surpriseEffect = new Tone.PingPongDelay({
        delayTime: "16n",
        feedback: 0.6,
        wet: 0
    }).toDestination();
    
    tiltFilter = new Tone.AutoFilter({
        frequency: "1n",
        baseFrequency: 200,
        octaves: 2,
        wet: 0
    }).toDestination();
    
    mouthSynth = new Tone.MonoSynth({
        oscillator: { type: "sawtooth" },
        envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.1 }
    }).toDestination();
    
    blinkSynth = new Tone.PluckSynth().toDestination();
    angryDistortion = new Tone.Distortion(0).toDestination();
    
    // Initialize wink synth
    winkSynth.toDestination();
}

// Fixed happy loop setup
function setupHappySynthLoop() {
    if (isPlayingSadLoop) {
        sadLoop.stop();
        isPlayingSadLoop = false;
    }

    const synth = new Tone.PolySynth(Tone.Synth, {
        envelope: {
            attack: 0.02,
            decay: 0.1,
            sustain: 0.3,
            release: 0.1
        }
    }).connect(analyser).toDestination();

    const majorChordProgression = [
        ["C4", "E4", "G4"], ["F4", "A4", "C5"], 
        ["G4", "B4", "D5"], ["C4", "E4", "G4"]
    ];

    let chordIndex = 0;
    happyLoop = new Tone.Loop(time => {
        const chord = majorChordProgression[chordIndex % majorChordProgression.length];
        synth.triggerAttackRelease(chord, "1n", time);
        chordIndex++;
    }, "1n");

    // Start everything
    Tone.Transport.bpm.value = 120;
    happyLoop.start(0);
    Tone.Transport.start();
    isHappyLoopPlaying = true;
}

// Fixed sad loop setup
const playSadMinorLoop = () => {
    if (isHappyLoopPlaying) {
        happyLoop.stop();
        isHappyLoopPlaying = false;
    }

    const synth = new Tone.PolySynth(Tone.Synth, {
        envelope: {
            attack: 0.05,
            decay: 0.2,
            sustain: 0.3,
            release: 0.2
        }
    }).connect(analyser).toDestination();

    const minorChordProgression = [
        ["A3", "C4", "E4"], ["D4", "F4", "A4"],
        ["E4", "G4", "B4"], ["A3", "C4", "E4"]
    ];

    let chordIndex = 0;
    sadLoop = new Tone.Loop((time) => {
        const chord = minorChordProgression[chordIndex % minorChordProgression.length];
        synth.triggerAttackRelease(chord, "1n", time);
        chordIndex++;
    }, "1n");

    Tone.Transport.bpm.value = 90;
    sadLoop.start(0);
    Tone.Transport.start();
    isPlayingSadLoop = true;
};

// Fixed wink loop
function toggleWinkLoop() {
    if (!winkLoop.isRunning) {
        winkLoop.start(0);
        Tone.Transport.start();
    } else {
        winkLoop.stop();
    }
}

// ========== VISUALIZER ==========
function setupVisualizer() {
    // Create analyser node
    analyser = new Tone.Analyser("waveform", 256);
    
    // Connect ALL audio sources to analyser
    Tone.Destination.connect(analyser);
    
    // Get canvas and context
    waveformCanvas = document.getElementById('visualizer-canvas');
    waveformCtx = waveformCanvas.getContext('2d');
    
    // Set initial size
    resizeVisualizer();
    
    // Handle window resizing
    window.addEventListener('resize', resizeVisualizer);
    
    // Start visualization loop
    Tone.Transport.scheduleRepeat(updateVisualization, "16n");
}

function resizeVisualizer() {
    waveformCanvas.width = waveformCanvas.offsetWidth * window.devicePixelRatio;
    waveformCanvas.height = waveformCanvas.offsetHeight * window.devicePixelRatio;
    waveformCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function updateVisualization() {
    if (!analyser || !waveformCanvas) return;
    
    const width = waveformCanvas.offsetWidth;
    const height = waveformCanvas.offsetHeight;
    const values = analyser.getValue();
    
    // Clear canvas
    waveformCtx.clearRect(0, 0, width, height);
    
    // Draw waveform
    waveformCtx.lineWidth = 2;
    waveformCtx.strokeStyle = 'rgb(195, 21, 21)';
    waveformCtx.beginPath();
    
    const sliceWidth = width / values.length;
    let x = 0;
    
    for (let i = 0; i < values.length; i++) {
        const v = values[i] / 128;
        const y = v * height / 2 + height / 2;
        
        if (i === 0) {
            waveformCtx.moveTo(x, y);
        } else {
            waveformCtx.lineTo(x, y);
        }
        
        x += sliceWidth;
    }
    
    waveformCtx.stroke();
}

// ========== FACE DETECTION HELPERS ==========
function drawFaceLandmarks(canvas, faces) {
    const ctx = canvas.getContext('2d');
    faces.forEach(result => {
        const points = result.landmarks.positions;
        
        // Draw points
        ctx.fillStyle = 'red';
        points.forEach(pt => {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
            ctx.fill();
        });
        
        // Draw connections
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        const drawPath = (indices) => {
            ctx.beginPath();
            indices.forEach((idx, i) => {
                const pt = points[idx];
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            });
            ctx.stroke();
        };
        drawPath([...Array(17).keys()]); // Jawline
    });
}

function detectWink(face) {
    if (!face?.landmarks) return false;
    const leftEAR = getEAR(face.landmarks.getLeftEye());
    const rightEAR = getEAR(face.landmarks.getRightEye());
    return (leftEAR < 0.2 && rightEAR > 0.3) || (rightEAR < 0.2 && leftEAR > 0.3);
}

function detectMouthOpen(face) {
    if (!face?.landmarks) return false;
    const mouth = face.landmarks.positions.slice(48, 68);
    const topLip = mouth[13].y;
    const bottomLip = mouth[19].y;
    const mouthOpen = Math.abs(bottomLip - topLip);
    const faceHeight = face.boundingBox?.height || 1;
    return (mouthOpen / faceHeight) > 0.15;
}

function detectHeadTilt(face) {
    if (!face?.landmarks) return 0;
    const leftEye = face.landmarks.getLeftEye();
    const rightEye = face.landmarks.getRightEye();
    const tiltRadians = Math.atan2(rightEye[0].y - leftEye[0].y, rightEye[0].x - leftEye[0].x);
    const tiltDegrees = tiltRadians * (180 / Math.PI);
    return tiltDegrees;
}

function detectBothEyesClosed(face) {
    if (!face?.landmarks) return false;
    const leftEAR = getEAR(face.landmarks.getLeftEye());
    const rightEAR = getEAR(face.landmarks.getRightEye());
    return leftEAR < 0.2 && rightEAR < 0.2;
}

function getEAR(eye) {
    const vertical1 = distance(eye[1], eye[5]);
    const vertical2 = distance(eye[2], eye[4]);
    const horizontal = distance(eye[0], eye[3]);
    return (vertical1 + vertical2) / (2.0 * horizontal);
}
  
function distance(p1, p2) {
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
}  

// ========== EMOTION HANDLERS ==========
function updateEmotionLog(faceData) {
    if (!faceData?.expressions) return;
    
    const currentEmotion = Object.entries(faceData.expressions).reduce((a, b) => 
        a[1] > b[1] ? a : b
    );
    const emotionName = currentEmotion[0];
    const emotionValue = currentEmotion[1].toFixed(2);
    
    // Update current display
    const currentElement = document.getElementById('current');
    if (currentElement) {
        currentElement.innerHTML = `
            <span class="emotion-name">${emotionName}</span>
            <span class="emotion-value">${emotionValue}</span>
        `;
    }
    
    // Update log
    if (emotionName !== lastEmotion) {
        lastEmotion = emotionName;
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        const logEntry = document.createElement('div');
        logEntry.className = 'log-entry';
        logEntry.innerHTML = `
            <span class="emotion">${emotionName}</span>
            <span class="value">${emotionValue}</span>
            <span class="time">@ ${timeString}</span>
        `;
        
        const logElement = document.querySelector('.log');
        if (logElement) {
            logElement.insertBefore(logEntry, logElement.firstChild);
            while (logElement.children.length > logLimit) {
                logElement.removeChild(logElement.lastChild);
            }
        }
    }
}

function updateEyeDisplay(state) {
    const eyeElement = document.getElementById('eyelog');
    if (!eyeElement) {
        console.error("eyelog element not found!");
        return;
    }
    console.log("Updating eye display to:", state);
    eyeElement.textContent = state === 'closed' ? 'CLOSED' : 
                             state === 'wink' ? 'WINK' : 'OPEN';
    eyeElement.style.color = state === 'closed' ? 'red' : 
                             state === 'wink' ? 'orange' : 'green';
}

function updateMouthDisplay(state) {
    const mouthElement = document.getElementById('mouthlog');
    if (!mouthElement) {
        console.error("mouthlog element not found!");
        return;
    }
    console.log("Updating mouth display to:", state);
    mouthElement.textContent = state === 'open' ? 'OPEN' : 'CLOSED';
    mouthElement.style.color = state === 'open' ? 'salmon' : 'skyblue';
}

document.addEventListener("DOMContentLoaded", () => {
    updateEyeDisplay('closed');
    updateMouthDisplay('open');
});

function handleSadExpression(faceAIData) {
    const isSad = faceAIData.some(face => face.expressions.sad > 0.7);
    if (isSad && !isPlayingSadLoop) {
        playSadMinorLoop();
    } else if (!isSad && isPlayingSadLoop) {
        sadLoop.stop();
        isPlayingSadLoop = false;
    }
}

function handleMouthOpen(face) {
    if (!face?.landmarks) {
        console.log("No face landmarks detected");
        return;
    }

    const mouth = face.landmarks.positions.slice(48, 68);
    const mouthHeight = mouth[13].y - mouth[19].y;
    console.log("Mouth height:", mouthHeight); // Debug line

    const isOpen = mouthHeight > 20;
    updateMouthDisplay(isOpen ? 'open' : 'closed');
    
    if (isOpen) {
        const note = Math.min(84, 60 + Math.floor(mouthHeight / 5));
        console.log("Playing mouth note:", note); // Debug line
        mouthSynth.triggerAttackRelease(Tone.Midi(note).toFrequency(), "8n");
    }
}

function handleHeadTilt(face) {
    const tiltAngle = detectHeadTilt(face);
    if (Math.abs(tiltAngle) > 0.2) {
        Tone.Destination.pan.value = tiltAngle / Math.PI;
        tiltFilter.baseFrequency = 200 + (Math.abs(tiltAngle) * 1000);
        tiltFilter.wet.value = 0.7;
    } else {
        tiltFilter.wet.value = 0;
    }
}

function handleBlink(face) {
    if (!face?.landmarks) {
        console.log("No face landmarks detected");
        return;
    }

    const leftEAR = getEAR(face.landmarks.getLeftEye());
    const rightEAR = getEAR(face.landmarks.getRightEye());
    console.log(`Eye Aspect Ratios - Left: ${leftEAR}, Right: ${rightEAR}`); // Debug line

    const eyesClosed = leftEAR < 0.2 && rightEAR < 0.2;
    const winkDetected = (leftEAR < 0.2 && rightEAR > 0.3) || 
                         (rightEAR < 0.2 && leftEAR > 0.3);

    if (eyesClosed) {
        console.log("Both eyes closed");
        updateEyeDisplay('closed');
    } else if (winkDetected) {
        console.log("Wink detected");
        updateEyeDisplay('wink');
    } else {
        console.log("Eyes open");
        updateEyeDisplay('open');
    }
    
    if (eyesClosed) {
        const notes = ["C4", "E4", "G4", "A4", "D5"];
        const randomNote = notes[Math.floor(Math.random() * notes.length)];
        blinkSynth.triggerAttackRelease(randomNote, "16n");
    }
}

function handleAngry(face) {
    if (face.expressions.angry > 0.7) {
        angryDistortion.distortion = 0.8;
        Tone.Destination.chain(angryDistortion);
    } else {
        Tone.Destination.disconnect(angryDistortion);
    }
}

function handleSurprised(face) {
    if (face.expressions.surprised > 0.7) {
        surpriseEffect.wet.value = 0.5;
        new Tone.MetalSynth().toDestination().triggerAttackRelease("C6", "32n");
    } else {
        surpriseEffect.wet.value = 0;
    }
}

function handleDisgusted(face) {
    if (face.expressions.disgusted > 0.7) {
        const filter = new Tone.Filter(500, "bandpass").toDestination();
        filter.Q.value = 10;
        filter.frequency.rampTo(2000, 0.5);
        setTimeout(() => filter.dispose(), 1000);
    }
}

// Start the application
run();