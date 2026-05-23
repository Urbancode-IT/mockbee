/* ============================================
   MockBee - AI Interview Logic (Phase-Driven)
   ============================================
   Uses mocker.py's 6-phase structured interview
   system. The AI generates all questions and
   feedback dynamically via the backend API.
   ============================================ */

// ── Phase Configuration (mirrors mocker.py) ──
const PHASES = [
    "self_intro",
    "projects_skills",
    "technical",
    "optimization",
    "behavioural",
    "hr_logistics",
];

const PHASE_LABELS = {
    self_intro:      "📋 Phase 1 — Self Introduction",
    projects_skills: "🛠 Phase 2 — Projects & Skills",
    technical:       "💻 Phase 3 — Technical Questions",
    optimization:    "⚡ Phase 4 — Optimization & Problem Solving",
    behavioural:     "🧠 Phase 5 — Behavioural Questions",
    hr_logistics:    "📝 Phase 6 — HR & Logistics",
};

const PHASE_Q_TARGETS = {
    self_intro: 2,
    projects_skills: 3,
    technical: 4,
    optimization: 3,
    behavioural: 5,
    hr_logistics: 5,
};

// ── Role Icon Mapping ──
const ROLE_ICON_MAPPING = {
    "Python": "fab fa-python",
    "Frontend": "fas fa-code",
    "Backend": "fas fa-server",
    "ML": "fas fa-brain",
    "Data Scientist": "fas fa-chart-pie",
    "Cloud": "fas fa-cloud",
    "DevOps": "fas fa-infinity",
    "Cybersecurity": "fas fa-user-shield",
    "Network": "fas fa-network-wired",
    "System Architect": "fas fa-sitemap",
    "QA": "fas fa-vial",
    "Mobile": "fas fa-mobile-screen-button",
    "Testing": "fas fa-vial",
    "AWS": "fab fa-aws",
    "Communication": "fas fa-comments",
};

// ── State ──
let roleName = "General Role";
let currentPhaseIndex = 0;
let questionCount = 0;       // total questions asked across all phases
let questionsInCurrentPhase = 0;
let totalQuestions = 22;     // sum of all PHASE_Q_TARGETS
let isInterviewComplete = false;
let isAwaitingAnswer = false;
let isAIProcessing = false;
let interviewTranscript = [];
let conversationHistory = []; // full chat history sent to backend
let currentMode = "standard";
let lastAIQuestion = ""; // tracks the most recent AI question for accurate transcript
let isVoiceMuted = false;

// ── Compute total question count ──
totalQuestions = Object.values(PHASE_Q_TARGETS).reduce((a, b) => a + b, 0);

// ── Web Speech API for voice ──
let recognition = null;
let isListening = false;
let synthUtterance = null;

// ── Init ──
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode') || "standard";
    roleName = urlParams.get('role') || "System Architect";
    currentMode = mode;

    // Set header title
    const roleTitleElem = document.getElementById('role-title');
    const modeBadgeElem = document.querySelector('.role-info span');

    if (mode === '5-min') {
        roleTitleElem.innerText = "5-Minute Drill";
        if (modeBadgeElem) modeBadgeElem.innerText = `${roleName} Session`;
    } else if (mode === '1-q') {
        roleTitleElem.innerText = "1-Question Deep Dive";
        if (modeBadgeElem) modeBadgeElem.innerText = `${roleName} Expert Task`;
    } else if (mode === 'rapid') {
        roleTitleElem.innerText = "Rapid Revision";
        if (modeBadgeElem) modeBadgeElem.innerText = `${roleName} Prep`;
    } else if (mode === 'warmup') {
        roleTitleElem.innerText = "Interview Warm-up";
        if (modeBadgeElem) modeBadgeElem.innerText = `${roleName} Mode`;
    } else {
        roleTitleElem.innerText = roleName;
        if (modeBadgeElem) modeBadgeElem.innerText = "AI Mock Interview";
    }

    // Apply mode-specific timer
    if (mode === '5-min' || mode === 'rapid') {
        const timerBox = document.getElementById('timer-box');
        if (timerBox) {
            timerBox.classList.remove('hidden');
            startCountdown(5 * 60);
        }
    }

    // 1-q dashboard embed class
    if (currentMode === '1-q' && window.self !== window.top) {
        document.body.classList.add('mode-1-q-dashboard');
    }

    // Set role icon
    const headerIcon = document.getElementById('header-role-icon');
    if (headerIcon) {
        let iconClass = "fas fa-globe";
        for (const [key, icon] of Object.entries(ROLE_ICON_MAPPING)) {
            if (roleName.toLowerCase().includes(key.toLowerCase())) {
                iconClass = icon;
                break;
            }
        }
        headerIcon.className = iconClass;
    }

    // Update progress display
    document.getElementById('total-q').innerText = totalQuestions;
    updateProgress();

    // Setup controls
    const userInput = document.getElementById('user-input');
    const submitBtn = document.getElementById('submit-btn');
    if (userInput) userInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;

    submitBtn.addEventListener('click', handleUserSubmit);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserSubmit();
        }
    });

    // Setup voice
    setupVoiceRecognition();

    // Setup mute button
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
        muteBtn.addEventListener('click', () => {
            isVoiceMuted = !isVoiceMuted;
            if (isVoiceMuted) {
                muteBtn.innerHTML = '<i class="fas fa-volume-mute" style="color: #ef4444;"></i>';
                if ('speechSynthesis' in window) window.speechSynthesis.cancel();
            } else {
                muteBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
            }
        });
    }

    // Start interview — show welcome + phase label + first AI question
    startInterview();
});


// ═══════════════════════════════════════════════════════
//  INTERVIEW FLOW
// ═══════════════════════════════════════════════════════

function startInterview() {
    // Welcome message
    sendAIMessage(`Welcome to your **${roleName}** interview. I'm your AI interviewer for today. Let's begin!`);

    // Initial silent prompt to ensure Groq gets a user message
    conversationHistory.push({ role: "user", content: "I am ready to begin the interview. Please ask the first question." });

    setTimeout(() => {
        requestAIQuestion();
    }, 1500);
}

function showPhaseLabel(phase) {
    // Intentionally empty: user requested to remove the phase indication popup message
}

function requestAIQuestion() {
    // Show typing indicator
    showTypingIndicator();

    const currentPhase = PHASES[currentPhaseIndex];

    fetch(`${API_BASE}/api/interview/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            role: roleName,
            level: "Mid-level",
            history: conversationHistory,
            phase: currentPhase,
            questions_in_phase: questionsInCurrentPhase,
        })
    })
    .then(async r => {
        if (!r.ok) {
            const errData = await r.json().catch(() => ({}));
            throw new Error(errData.detail || "API responded with an error");
        }
        return r.json();
    })
    .then(data => {
        removeTypingIndicator();

        const reply = data.reply;
        if (!reply) throw new Error("No reply from AI");

        // Add to conversation history
        conversationHistory.push({ role: "assistant", content: reply });

        // Check for markers
        if (reply.includes("[INTERVIEW_COMPLETE]")) {
            const cleanReply = reply.replace("[INTERVIEW_COMPLETE]", "").trim();
            sendAIMessage(cleanReply);
            speakText(cleanReply);
            finishInterview();
            return;
        }

        if (reply.includes("[PHASE_COMPLETE]")) {
            const cleanReply = reply.replace("[PHASE_COMPLETE]", "").trim();
            sendAIMessage(cleanReply);
            speakText(cleanReply);

            // Advance phase
            currentPhaseIndex++;
            questionsInCurrentPhase = 0; // Reset for the next phase
            
            // Add a silent user prompt so the AI knows we are ready, satisfying role alternation
            conversationHistory.push({ role: "user", content: `I am ready. Please proceed to the next phase and ask the first question.` });

            if (currentPhaseIndex < PHASES.length) {
                setTimeout(() => requestAIQuestion(), 1500);
            } else {
                finishInterview();
            }
            return;
        }

        // Normal question — display and enable input
        questionCount++;
        questionsInCurrentPhase++;
        updateProgress();
        lastAIQuestion = reply; // save for transcript
        sendAIMessage(`**Q${questionCount}:** ${reply}`);
        speakText(reply);
        enableInput();
    })
    .catch(err => {
        removeTypingIndicator();
        console.error("AI Error:", err);
        let errorMsg = "⚠️ The AI server is starting up. Please wait ~30 seconds and click **Retry** below.";
        if (err.message && err.message.includes("429")) {
            errorMsg = "⚠️ AI API Quota Exceeded. Please try again later or check your API key limit.";
        } else if (err.message && err.message !== "API responded with an error" && err.message !== "Failed to fetch") {
            errorMsg = `⚠️ Error: ${err.message}. Please click **Retry** below.`;
        }
        sendAIMessage(errorMsg);
        setTimeout(() => {
            const chatBox = document.getElementById('chat-box');
            const retryDiv = document.createElement('div');
            retryDiv.className = 'message';
            retryDiv.innerHTML = `<button onclick="this.parentElement.remove(); requestAIQuestion();" style="margin:8px auto; display:block; padding:10px 24px; background:#1a1a1a; color:#fff; border:none; border-radius:8px; cursor:pointer; font-weight:700;">🔄 Retry</button>`;
            chatBox.appendChild(retryDiv);
            scrollToBottom();
        }, 400);
        // Do not enable input here, user must click Retry
    });
}

function handleUserSubmit() {
    if (isInterviewComplete || !isAwaitingAnswer || isAIProcessing) return;

    const userInput = document.getElementById('user-input');
    const message = userInput.value.trim();
    if (message === "") return;

    // Stop voice recognition if active
    if (isListening && recognition) {
        isListening = false;
        recognition.stop();
    }

    // Disable input
    isAwaitingAnswer = false;
    isAIProcessing = true;
    disableInput();
    userInput.value = "";

    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    // Add user message to chat
    const userMsgElem = addUserMessage(message);

    // Add to conversation history
    conversationHistory.push({ role: "user", content: message });

    // Save to transcript
    interviewTranscript.push({
        question: lastAIQuestion || `[${PHASE_LABELS[PHASES[currentPhaseIndex]]}]`,
        answer: message,
        phase: PHASES[currentPhaseIndex]
    });

    // Request AI response (feedback + next question)
    showTypingIndicator();

    const currentPhase = PHASES[currentPhaseIndex];

    fetch(`${API_BASE}/api/interview/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            role: roleName,
            level: "Mid-level",
            history: conversationHistory,
            phase: currentPhase,
            questions_in_phase: questionsInCurrentPhase,
        })
    })
    .then(async r => {
        if (!r.ok) {
            const errData = await r.json().catch(() => ({}));
            throw new Error(errData.detail || "API responded with an error");
        }
        return r.json();
    })
    .then(data => {
        removeTypingIndicator();
        isAIProcessing = false;

        const reply = data.reply;
        if (!reply) throw new Error("No reply from AI");

        // Add to conversation history
        conversationHistory.push({ role: "assistant", content: reply });

        // Check for [INTERVIEW_COMPLETE]
        if (reply.includes("[INTERVIEW_COMPLETE]")) {
            const cleanReply = reply.replace("[INTERVIEW_COMPLETE]", "").trim();
            sendAIMessage(cleanReply, true);
            speakText(cleanReply);
            finishInterview();
            return;
        }

        // Check for [PHASE_COMPLETE]
        if (reply.includes("[PHASE_COMPLETE]")) {
            const cleanReply = reply.replace("[PHASE_COMPLETE]", "").trim();
            sendAIMessage(cleanReply, true);
            speakText(cleanReply);

            currentPhaseIndex++;
            questionsInCurrentPhase = 0; // Reset for next phase
            
            // Silent user prompt to keep roles alternating
            conversationHistory.push({ role: "user", content: `I am ready. Please proceed to the next phase and ask the first question.` });

            if (currentPhaseIndex < PHASES.length) {
                setTimeout(() => requestAIQuestion(), 1500);
            } else {
                finishInterview();
            }
            return;
        }

        // Normal reply — feedback + next question embedded
        // The AI gives feedback and asks the next question in one message
        questionCount++;
        questionsInCurrentPhase++;
        updateProgress();
        lastAIQuestion = reply; // save for next transcript entry
        sendAIMessage(reply, true, questionCount);
        speakText(reply);
        enableInput();
    })
    .catch(err => {
        removeTypingIndicator();
        isAIProcessing = false;
        console.error("AI Error:", err);
        let errorMsg = "⚠️ Connection lost or server waking up. Please wait ~30 seconds and try submitting again.";
        if (err.message && err.message.includes("429")) {
            errorMsg = "⚠️ AI API Quota Exceeded. Please try again later or check your API key limit.";
        } else if (err.message && err.message !== "API responded with an error" && err.message !== "Failed to fetch") {
            errorMsg = `⚠️ Error: ${err.message}. Please try submitting again.`;
        }
        sendAIMessage(errorMsg);
        
        // Revert state so the user can retry without breaking the interview
        conversationHistory.pop();
        interviewTranscript.pop();
        if (userMsgElem) userMsgElem.remove();
        
        const userInputElem = document.getElementById('user-input');
        if (userInputElem) userInputElem.value = message;
        
        enableInput();
    });
}

function finishInterview() {
    if (isInterviewComplete) return;
    isInterviewComplete = true;
    updateProgress();
    disableInput();
    setTimeout(showResultsButton, 1200);
}


// ═══════════════════════════════════════════════════════
//  VOICE — Web Speech API
// ═══════════════════════════════════════════════════════

function setupVoiceRecognition() {
    const micBtn = document.querySelector('.mic-btn');
    const userInput = document.getElementById('user-input');
    const inputContainer = document.querySelector('.input-container');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        if (micBtn) {
            micBtn.title = "Voice not supported in this browser";
            micBtn.style.opacity = "0.5";
            micBtn.style.cursor = "not-allowed";
        }
        return;
    }

    // Update title from "coming soon" to active
    if (micBtn) micBtn.title = "Click to speak (Microphone)";

    // Recording indicator
    let indicator = document.querySelector('.recording-indicator');
    if (!indicator && inputContainer) {
        indicator = document.createElement('div');
        indicator.className = 'recording-indicator';
        indicator.innerHTML = '<i class="fas fa-circle"></i> Listening...';
        inputContainer.style.position = 'relative';
        inputContainer.appendChild(indicator);
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let originalValue = '';

    micBtn.addEventListener('click', (e) => {
        e.preventDefault();

        if (!isAwaitingAnswer) return; // Don't listen if not waiting for answer

        if (isListening) {
            isListening = false;
            recognition.stop();
        } else {
            isListening = true;
            try {
                recognition.start();
            } catch(err) {
                console.error("Recognition start error:", err);
            }
        }
    });

    recognition.onstart = () => {
        micBtn.classList.add('active');
        if (indicator) indicator.classList.add('active');
        userInput.placeholder = "🎙️ Listening... Speak naturally.";
        userInput.focus();
        
        originalValue = userInput.value;
        if (originalValue && !originalValue.endsWith(' ')) {
            originalValue += ' ';
        }
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript + ' ';
            } else {
                interimTranscript += transcript;
            }
        }

        // Add any final text to our baseline
        if (finalTranscript) {
            originalValue += finalTranscript;
        }

        // Live update the actual input field so the user sees their words forming
        userInput.value = originalValue + interimTranscript;
        userInput.scrollLeft = userInput.scrollWidth;
    };

    recognition.onend = () => {
        if (isListening) {
            try { recognition.start(); } catch(e) {} // Auto-restart
        } else {
            micBtn.classList.remove('active');
            if (indicator) indicator.classList.remove('active');
            userInput.placeholder = "Type your answer here...";
        }
    };

    recognition.onerror = (event) => {
        if (event.error === 'no-speech') return;
        if (event.error === 'aborted') return;
        
        console.error("Speech Recognition Error:", event.error);
        if (event.error === 'not-allowed') {
            alert("Microphone access was denied. Please allow microphone permissions in your browser to use voice input.");
        }
        
        isListening = false;
        try { recognition.stop(); } catch(e) {}
        
        micBtn.classList.remove('active');
        if (indicator) indicator.classList.remove('active');
        userInput.placeholder = "Type your answer here...";
    };
}

/**
 * Text-to-Speech: Read AI questions aloud
 */
function speakText(text) {
    if (!('speechSynthesis' in window) || isVoiceMuted) return;

    // We do NOT cancel ongoing speech here anymore, so consecutive
    // messages (like phase complete + next question) will queue up
    // and play back-to-back naturally.

    // Clean up text — remove markdown, markers
    let clean = text
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\[PHASE_COMPLETE\]/g, '')
        .replace(/\[INTERVIEW_COMPLETE\]/g, '')
        .replace(/Q\d+:/g, '')
        .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 0.9;
    utterance.lang = 'en-US';

    // Try to pick a natural voice
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
        v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Natural')
    );
    if (preferred) utterance.voice = preferred;

    window.speechSynthesis.speak(utterance);
}

// Load voices (some browsers load asynchronously)
if ('speechSynthesis' in window) {
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
}


// ═══════════════════════════════════════════════════════
//  UI HELPERS
// ═══════════════════════════════════════════════════════

function sendAIMessage(text, isFeedback = false, qNum = null) {
    const chatBox = document.getElementById('chat-box');
    const messageDiv = document.createElement('div');
    messageDiv.className = "message message--ai";

    // Parse markdown bold
    let formatted = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    let contentHtml = `<div class="ai-bubble">`;
    if (isFeedback) {
        const qPrefix = qNum ? `<strong style="color: var(--navy-dark); font-size: 1.05rem;">Q${qNum}: </strong>` : '';
        contentHtml += `<div class="feedback-box">
            <i class="fas fa-certificate icon"></i>
            <strong>Interviewer:</strong><br>
            ${qPrefix}${formatted}
        </div>`;
    } else {
        contentHtml += formatted;
    }
    contentHtml += `</div>`;
    messageDiv.innerHTML = contentHtml;

    chatBox.appendChild(messageDiv);
    scrollToBottom();
}

function addUserMessage(text) {
    const chatBox = document.getElementById('chat-box');
    const messageDiv = document.createElement('div');
    messageDiv.className = "message message--user";
    messageDiv.innerHTML = `
        <div class="user-icon-wrap"><i class="fas fa-user"></i></div>
        <div class="user-bubble">${text}</div>
    `;
    chatBox.appendChild(messageDiv);
    scrollToBottom();
    return messageDiv;
}

function showTypingIndicator() {
    const chatBox = document.getElementById('chat-box');
    const existing = document.getElementById('typing-indicator');
    if (existing) return;

    const tempDiv = document.createElement('div');
    tempDiv.className = "message message--ai";
    tempDiv.id = "typing-indicator";
    tempDiv.innerHTML = `<div class="ai-bubble"><i class="fas fa-spinner fa-spin"></i> AI is thinking...</div>`;
    chatBox.appendChild(tempDiv);
    scrollToBottom();
}

function removeTypingIndicator() {
    const ind = document.getElementById('typing-indicator');
    if (ind) ind.remove();
}

function enableInput() {
    isAwaitingAnswer = true;
    const userInput = document.getElementById('user-input');
    const submitBtn = document.getElementById('submit-btn');
    if (userInput) { userInput.disabled = false; userInput.focus(); }
    if (submitBtn) submitBtn.disabled = false;
}

function disableInput() {
    isAwaitingAnswer = false;
    const userInput = document.getElementById('user-input');
    const submitBtn = document.getElementById('submit-btn');
    if (userInput) userInput.disabled = true;
    if (submitBtn) submitBtn.disabled = true;
}

function updateProgress() {
    const currentQ = document.getElementById('current-q');
    const fill = document.querySelector('.progress-bar-fill');
    if (!totalQuestions) return;

    const displayIndex = Math.min(questionCount, totalQuestions);
    currentQ.innerText = displayIndex;

    const percent = (displayIndex / totalQuestions) * 100;
    fill.style.width = percent + "%";
}

function scrollToBottom() {
    const chatBox = document.getElementById('chat-box');
    chatBox.scrollTo({ top: chatBox.scrollHeight, behavior: 'smooth' });
}


// ═══════════════════════════════════════════════════════
//  TIMER (for quick practice modes)
// ═══════════════════════════════════════════════════════

function startCountdown(seconds) {
    const display = document.getElementById('timer-display');
    const timerBox = document.getElementById('timer-box');
    let timeLeft = seconds;

    const timerInterval = setInterval(() => {
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        if (display) display.innerText = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        if (timeLeft <= 60 && timerBox) timerBox.classList.add('warning');
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            handleTimeUp();
        }
        timeLeft--;
    }, 1000);
}

function handleTimeUp() {
    if (isInterviewComplete) return;
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: 'Time is up!',
            text: "Let's wrap up this session.",
            icon: 'info',
            confirmButtonColor: '#1a1a1a',
            confirmButtonText: 'Got it',
            background: '#ffffff',
            color: '#1a1a1a',
            backdrop: `rgba(0,0,0,0.4)`
        });
    }
    finishInterview();
}


// ═══════════════════════════════════════════════════════
//  RESULTS BUTTON
// ═══════════════════════════════════════════════════════

function showResultsButton() {
    const chatBox = document.getElementById('chat-box');
    const inputArea = document.querySelector('.input-area');

    if (inputArea) {
        inputArea.style.opacity = "0";
        inputArea.style.pointerEvents = "none";
        inputArea.style.display = "none";
    }

    const btnContainer = document.createElement('div');
    btnContainer.className = "results-btn-container";
    btnContainer.innerHTML = `
        <button class="btn-view-results" id="generate-report-btn">
            See Analysis and Report &rarr;
        </button>
        <div class="session-complete-msg">
            <i class="fas fa-check-circle"></i> Interview Assessment Complete
        </div>
    `;

    chatBox.appendChild(btnContainer);
    scrollToBottom();

    // Demo modal for standard mode
    const isStudent = localStorage.getItem('mockbee_role') === 'STUDENT' || localStorage.getItem('mockbee_is_student') === 'true';
    if (!isStudent && typeof showDemoModal === 'function' && currentMode !== '1-q' && currentMode !== '5-min' && currentMode !== 'rapid' && currentMode !== 'warmup') {
        setTimeout(showDemoModal, 800);
    }

    // Handle report generation
    const generateBtn = document.getElementById('generate-report-btn');
    generateBtn.addEventListener('click', (e) => {
        e.preventDefault();

        const sessionData = {
            id: String(Date.now()),
            role: roleName,
            transcript: interviewTranscript,
            conversationHistory: conversationHistory,
            date: new Date().toLocaleDateString(),
            totalQuestions: questionCount,
            mode: currentMode,
            isQuick: currentMode !== 'standard',
            isPro: currentMode === 'standard'
        };

        localStorage.setItem('recentInterview', JSON.stringify(sessionData));

        let history = JSON.parse(localStorage.getItem('mockbee_interviews') || '[]');
        history.push(sessionData);
        localStorage.setItem('mockbee_interviews', JSON.stringify(history));
        saveSessionDraft(sessionData);

        window.location.href = 'performance.html?view=report';
    });
}

function saveSessionDraft(sessionData) {
    const userEmail = localStorage.getItem('mockbee_user_email');
    if (!userEmail || typeof API_BASE === 'undefined') return;

    fetch(`${API_BASE}/api/interview/save`, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: userEmail,
            role: sessionData.role,
            date: sessionData.date,
            score: sessionData.analysis ? sessionData.analysis.overall : null,
            analysis: sessionData.analysis || {},
            transcript: sessionData.transcript || [],
            conversationHistory: sessionData.conversationHistory || [],
            totalQuestions: sessionData.totalQuestions || 0,
            mode: sessionData.mode || 'standard',
            session_id: sessionData.id,
            isQuick: sessionData.isQuick,
            isPro: sessionData.isPro,
            topic: sessionData.topic || sessionData.role
        })
    }).catch(err => console.error("Session draft save failed:", err));
}
