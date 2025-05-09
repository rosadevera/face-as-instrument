document.body.addEventListener('click', async () => {
    await Tone.start();
    console.log('Audio context started');
});


document.getElementById('about').addEventListener('click', function() {
    document.getElementById('aboutpopup').classList.add('active');
});

document.getElementById('closeAbout').addEventListener('click', function() {
    document.getElementById('aboutpopup').classList.remove('active');
});

// Close when clicking outside content (optional)
document.getElementById('aboutpopup').addEventListener('click', function(e) {
    if (e.target === this) { // If clicked on backdrop (not content)
        this.classList.remove('active');
    }
});
  

let emotionLogInterval;
let lastEmotion = '';
const logLimit = 20;

console.log(faceapi)

const run = async()=>{
    
    //loading the models is going to use await
    const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
    })
    const videoFeedEl = document.getElementById('video-feed')
    videoFeedEl.srcObject = stream

    //we need to load our models
    //pre-trained machine learning for facial detection!!
    await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri('./models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('./models'),
        faceapi.nets.ageGenderNet.loadFromUri('./models'),
        faceapi.nets.faceExpressionNet.loadFromUri('./models'),
    ])

    //make the canvas the same size and in the same spot as the video feed
    const canvas = document.getElementById('canvas')
    canvas.style.left = videoFeedEl.offsetLeft
    canvas.style.top = videoFeedEl.offsetTop
    canvas.height = videoFeedEl.height
    canvas.width = videoFeedEl.width


    //facial detection with points
    setInterval(async()=> {
        //get video feed and hand it to detectAllFaces method
        let faceAIData = await faceapi.detectAllFaces(videoFeedEl)
        .withFaceLandmarks()
        .withFaceDescriptors()
        .withAgeAndGender()
        .withFaceExpressions();
    
        // console.log(faceAIData)
        //yay lots of good facial detection data in faceAIData
        //faceAIData is an array, one element for each face

        //draw on our face/canvas
        //first clear the canvas
        canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height)
        //draw the bounding box
        faceAIData = faceapi.resizeResults(faceAIData,videoFeedEl)
        //comment out whichever one i dont need
        // faceapi.draw.drawDetections(canvas,faceAIData)
        faceapi.draw.drawFaceLandmarks(canvas,faceAIData)
        // faceapi.draw.drawFaceExpressions(canvas,faceAIData)

        const ctx = canvas.getContext('2d');
        faceAIData.forEach(result => {
            const landmarks = result.landmarks;
            const points = landmarks.positions;
        
            // Draw points
            ctx.fillStyle = 'red';
            points.forEach(pt => {
                ctx.beginPath();
                ctx.arc(pt.x, pt.y, 2, 0, 2 * Math.PI);
                ctx.fill();
            });
        
            ctx.strokeStyle = 'white';
            ctx.lineWidth = 1;
        
            const drawPath = (indices) => {
                ctx.beginPath();
                indices.forEach((idx, i) => {
                    const pt = points[idx];
                    if (i === 0) {
                        ctx.moveTo(pt.x, pt.y);
                    } else {
                        ctx.lineTo(pt.x, pt.y);
                    }
                });
                ctx.stroke();
            };
        
            // Example: draw jawline (indices 0 to 16)
            drawPath([...Array(17).keys()]);
        
            // You can add more paths for eyes, mouth, etc., using the landmark index map.
        });        


        if (faceAIData.length > 0) {
            const mainFace = faceAIData[0]; // assuming single face
            updateEmotionLog(mainFace); 
            playHappyLoop(mainFace); // call the function
        }
    
        function playHappyLoop(expressionData) {
            if (!expressionData || !expressionData.expressions) return;
        
            const happyProbability = expressionData.expressions.happy;
            
            console.log('Happy Probability:', happyProbability); // Debugging log
        
            // Only trigger the loop if clearly happy
            if (happyProbability > 0.8 && !isHappyLoopPlaying) {
                isHappyLoopPlaying = true;
        
                // Set up the synth if it doesn't exist
                if (!happyLoop) {
                    setupHappySynthLoop();
                } else {
                    Tone.start(); // Resume audio context if needed
                    Tone.Transport.start();
                    happyLoop.start();
                }
            }
        
            // Stop if no longer happy
            if (happyProbability < 0.5 && isHappyLoopPlaying) {
                isHappyLoopPlaying = false;
                happyLoop.stop();
            }
        }
        
        
        function handleSadExpression(faceAIData) {
            const isSad = faceAIData.some(face => {
                const expressions = face.expressions;
                return expressions.sad > 0.7;
            });
        
            if (isSad && !isPlayingSadLoop) {
                playSadMinorLoop();
            } else if (!isSad && isPlayingSadLoop && sadLoop) {
                sadLoop.stop();
                isPlayingSadLoop = false;
            }
        }        
        handleSadExpression(faceAIData) 
        
        // Improved wink detection parameters
        const WINK_THRESHOLD = 0.25; // Adjusted threshold
        const EYE_OPEN_THRESHOLD = 0.35; // Minimum EAR for an "open" eye
        const WINK_MIN_DURATION = 200; // Minimum wink duration in ms
        const WINK_COOLDOWN = 500; // Time between allowed wink detections

    // Add these after your existing Tone.js variables
    let surpriseEffect, tiltFilter, mouthSynth, blinkSynth, angryDistortion;

    // Initialize additional audio components
    function setupAdditionalAudio() {
        // Surprise effect (glitch/echo)
        surpriseEffect = new Tone.PingPongDelay({
            delayTime: "16n",
            feedback: 0.6,
            wet: 0
        }).toDestination();
        
        // Head tilt filter
        tiltFilter = new Tone.AutoFilter({
            frequency: "1n",
            baseFrequency: 200,
            octaves: 2,
            wet: 0
        }).toDestination();
        
        // Mouth open synth
        mouthSynth = new Tone.MonoSynth({
            oscillator: { type: "sawtooth" },
            envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.1 }
        }).toDestination();
        
        // Blink randomizer
        blinkSynth = new Tone.PluckSynth().toDestination();
        
        // Angry distortion
        angryDistortion = new Tone.Distortion(0).toDestination();
    }

        let winkDetected = false;
        let winkLoopPlaying = false;
        let lastWinkTime = 0;
        let winkStartTime = 0;

        // Replace your existing wink detection with:
function detectWink(face) {
    if (!face || !face.landmarks) return false;
    
    const leftEAR = getEAR(face.landmarks.getLeftEye());
    const rightEAR = getEAR(face.landmarks.getRightEye());
    
    // Wink is when one eye is closed and the other is open
    return (leftEAR < 0.2 && rightEAR > 0.3) || (rightEAR < 0.2 && leftEAR > 0.3);
}

        

        
        function detectMouthOpen(face) {
            if (!face.landmarks) return false;
            const mouth = face.landmarks.positions.slice(48, 68);
            const mouthHeight = mouth[13].y - mouth[19].y; // Vertical distance between lips
            return mouthHeight > 20; // Adjust threshold based on testing
        }

        function detectHeadTilt(face) {
            if (!face.landmarks) return 0;
            const leftEye = face.landmarks.getLeftEye();
            const rightEye = face.landmarks.getRightEye();
            // Calculate angle between eyes
            const angle = Math.atan2(rightEye[0].y - leftEye[0].y, rightEye[0].x - leftEye[0].x);
            return angle; // Returns tilt angle in radians
        }

        function detectBothEyesClosed(face) {
            if (!face.landmarks) return false;
            const leftEAR = getEAR(face.landmarks.getLeftEye());
            const rightEAR = getEAR(face.landmarks.getRightEye());
            return leftEAR < 0.2 && rightEAR < 0.2; // Both eyes very closed
        }
    }, 200)
}

run()



// TONE.JS CODE BELOW!

let isHappyLoopPlaying = false;
let happyLoop;

function setupHappySynthLoop() {
    if (isPlayingSadLoop) return;

    // Major chord loop (C major chord progression)
    const synth = new Tone.PolySynth().toDestination();
    const majorChordProgression = [
        ["C4", "E4", "G4"],   // C major
        ["F4", "A4", "C5"],   // F major
        ["G4", "B4", "D5"],   // G major
        ["C4", "E4", "G4"],   // Back to C
    ];

    let chordIndex = 0;

    happyLoop = new Tone.Loop(time => {
        const chord = majorChordProgression[chordIndex % majorChordProgression.length];
        synth.triggerAttackRelease(chord, "1n", time);
        chordIndex++;
    }, "1n");

    Tone.start();
    happyLoop.start(0);
    Tone.Transport.start();
    
    isHappyLoopPlaying = true;
}


let isPlayingSadLoop = false;
let sadLoop;

const playSadMinorLoop = () => {
    if (isPlayingSadLoop) return;
  
    const synth = new Tone.PolySynth().toDestination();
    const minorChordProgression = [
      ["A3", "C4", "E4"],   // A minor
      ["D4", "F4", "A4"],   // D minor
      ["E4", "G4", "B4"],   // E minor
      ["A3", "C4", "E4"],   // A minor again
    ];
  
    let chordIndex = 0;
  
    sadLoop = new Tone.Loop((time) => {
      const chord = minorChordProgression[chordIndex % minorChordProgression.length];
      synth.triggerAttackRelease(chord, "1n", time);
      chordIndex++;
    }, "1n"); // one chord per measure
  
    Tone.start();
    sadLoop.start(0);
    Tone.Transport.start();
  
    isPlayingSadLoop = true;
};  
  
const winkSynth = new Tone.MembraneSynth().toDestination();
        let winkLoop = new Tone.Loop((time) => {
            winkSynth.triggerAttackRelease("C2", "8n", time);
        }, "2n"); 

        function toggleWinkLoop() {
            if (!winkLoopPlaying) {
                winkLoop.start(0);
                Tone.Transport.start();
                winkLoopPlaying = true;
            } else {
                winkLoop.stop();
                winkLoopPlaying = false;
            }
        }
        function updateEmotionLog(faceData) {
            if (!faceData || !faceData.expressions) return;
            
            // Get current emotion with highest probability
            const expressions = faceData.expressions;
            const currentEmotion = Object.entries(expressions).reduce((a, b) => 
                a[1] > b[1] ? a : b
            );
            
            // Format the emotion name and value
            const emotionName = currentEmotion[0];
            const emotionValue = currentEmotion[1].toFixed(2);
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            // Update current emotion display
            const currentElement = document.getElementById('current');
            if (currentElement) {
                currentElement.innerHTML = `
                    <span class="emotion-name">${emotionName}</span>
                    <span class="emotion-value">${emotionValue}</span>
                `;
            }
            
            // Only log if emotion changed
            if (emotionName !== lastEmotion) {
                lastEmotion = emotionName;
                
                const logElement = document.querySelector('.log');
                if (logElement) {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry';
                    logEntry.innerHTML = `
                        <span class="emotion">${emotionName}</span>
                        <span class="value">${emotionValue}</span>
                        <span class="time">@ ${timeString}</span>
                    `;
                    
                    // Add new entry at the top
                    logElement.insertBefore(logEntry, logElement.firstChild);
                    
                    // Limit number of log entries
                    while (logElement.children.length > logLimit) {
                        logElement.removeChild(logElement.lastChild);
                    }
                }
            }
        }
        

setInterval(async() => {
    // Add these inside your face detection interval, after detecting the face
if (faceAIData.length > 0) {
    const mainFace = faceAIData[0];
    
    // Existing emotion detection
    updateEmotionLog(mainFace);
    playHappyLoop(mainFace);
    
    // New detections
    handleMouthOpen(mainFace);
    handleHeadTilt(mainFace);
    handleBlink(mainFace);
    handleAngry(mainFace);
    handleSurprised(mainFace);
    handleDisgusted(mainFace);
}

// Add these new handler functions
function handleMouthOpen(face) {
    if (detectMouthOpen(face)) {
        // Play notes based on mouth openness
        const mouthHeight = face.landmarks.positions[13].y - face.landmarks.positions[19].y;
        const note = Math.min(84, 60 + Math.floor(mouthHeight / 5)); // Map to MIDI notes
        mouthSynth.triggerAttackRelease(Tone.Midi(note).toFrequency(), "8n");
    }
}

function handleHeadTilt(face) {
    const tiltAngle = detectHeadTilt(face);
    if (Math.abs(tiltAngle) > 0.2) { // Significant tilt
        // Pan based on tilt direction
        const panPos = tiltAngle / Math.PI; // Normalize to -1..1
        Tone.Destination.pan.value = panPos;
        
        // Adjust filter based on tilt amount
        tiltFilter.baseFrequency = 200 + (Math.abs(tiltAngle) * 1000);
        tiltFilter.wet.value = 0.7;
    } else {
        tiltFilter.wet.value = 0;
    }
}

function handleBlink(face) {
    if (detectBothEyesClosed(face)) {
        // Randomize sound on blink
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
        angryDistortion.distortion = 0;
        Tone.Destination.disconnect(angryDistortion);
    }
}

function handleSurprised(face) {
    if (face.expressions.surprised > 0.7) {
        surpriseEffect.wet.value = 0.5;
        // Add a high pitch "ping"
        const ping = new Tone.MetalSynth().toDestination();
        ping.triggerAttackRelease("C6", "32n");
    } else {
        surpriseEffect.wet.value = 0;
    }
}

function handleDisgusted(face) {
    if (face.expressions.disgusted > 0.7) {
        // Create a "squelchy" filter effect
        const disgustFilter = new Tone.Filter(500, "bandpass").toDestination();
        disgustFilter.Q.value = 10;
        disgustFilter.frequency.rampTo(2000, 0.5);
        setTimeout(() => disgustFilter.dispose(), 1000);
    }
}
}, 200);

