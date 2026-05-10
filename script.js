const API_BASE = "http://localhost:8000/api";
let currentQuizData = [];

// 1. Theme Management
document.getElementById('themeSelect').addEventListener('change', (e) => {
    document.documentElement.setAttribute('data-theme', e.target.value);
});

// 2. Tab Management
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        e.target.classList.add('active');
        document.getElementById(e.target.getAttribute('data-target')).classList.add('active');
    });
});

// 3. Input Mode Toggling
document.querySelectorAll('input[name="sourceType"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
        document.querySelectorAll('.input-section').forEach(sec => sec.classList.remove('active'));
        document.getElementById(`input-${e.target.value}-container`).classList.add('active');
    });
});

// 4. API Calls
function getSettings() {
    return {
        api_key: document.getElementById('apiKey').value,
        summary_mode: document.getElementById('summaryMode').value,
        language: document.getElementById('language').value,
        num_questions: parseInt(document.getElementById('numQuestions').value)
    };
}

async function processText() {
    const settings = getSettings();
    settings.text = document.getElementById('directText').value;
    await executeRequest('/process_text', settings);
}

async function processUrl() {
    const settings = getSettings();
    settings.url = document.getElementById('websiteUrl').value;
    await executeRequest('/process_url', settings);
}

async function processPdf() {
    const settings = getSettings();
    const file = document.getElementById('pdfFile').files[0];
    if (!file) return showError("Please select a PDF file.");
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('api_key', settings.api_key);
    formData.append('summary_mode', settings.summary_mode);
    formData.append('language', settings.language);
    formData.append('num_questions', settings.num_questions);
    formData.append('force_ocr', document.getElementById('forceOcr').checked);

    await executeRequest('/process_pdf', formData, true);
}

async function executeRequest(endpoint, data, isFormData = false) {
    const loading = document.getElementById('loading');
    const errorBox = document.getElementById('error-message');
    
    if (!isFormData && !data.api_key || isFormData && !data.get('api_key')) {
        return showError("Please enter your Gemini API Key in the settings.");
    }

    loading.classList.remove('hidden');
    errorBox.classList.add('hidden');

    try {
        const options = { method: 'POST' };
        if (isFormData) {
            options.body = data;
        } else {
            options.headers = { 'Content-Type': 'application/json' };
            options.body = JSON.stringify(data);
        }

        const res = await fetch(`${API_BASE}${endpoint}`, options);
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.detail || "API Request Failed");
        }

        const result = await res.json();
        renderResults(result);
        
        // Auto-switch to notes tab
        document.querySelector('[data-target="tab-notes"]').click();
    } catch (error) {
        showError(error.message);
    } finally {
        loading.classList.add('hidden');
    }
}

function showError(msg) {
    const errorBox = document.getElementById('error-message');
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
}

// 5. Render Data
function renderResults(data) {
    // Render Notes using marked.js
    document.getElementById('notes-container').innerHTML = marked.parse(data.summary);

    // Render Flashcards
    const fcContainer = document.getElementById('flashcards-container');
    fcContainer.innerHTML = '';
    data.flashcards.forEach((card, i) => {
        fcContainer.innerHTML += `
            <details class="flashcard">
                <summary>Q${i+1}: ${card.question}</summary>
                <div class="flashcard-answer"><strong>Answer:</strong> ${card.answer}</div>
            </details>`;
    });

    // Render Quiz Setup
    currentQuizData = data.quiz;
    renderQuizForm();
}

function renderQuizForm() {
    const quizContainer = document.getElementById('quiz-container');
    let html = `<form id="quizForm" onsubmit="submitQuiz(event)">`;
    
    currentQuizData.forEach((q, i) => {
        html += `<div class="quiz-question">
            <h4>${i+1}. ${q.question}</h4>
            <div class="quiz-options">`;
        q.options.forEach((opt, j) => {
            html += `<label><input type="radio" name="q${i}" value="${j}" required> ${opt}</label>`;
        });
        html += `</div></div>`;
    });
    
    html += `<button type="submit" class="action-btn">Submit Quiz</button></form>`;
    quizContainer.innerHTML = html;
}

window.submitQuiz = function(event) {
    event.preventDefault();
    const formData = new FormData(event.target);
    let score = 0;
    let html = `<h2>Quiz Results</h2>`;

    currentQuizData.forEach((q, i) => {
        const selectedIdx = parseInt(formData.get(`q${i}`));
        const isCorrect = selectedIdx === q.correct_answer;
        if (isCorrect) score++;

        html += `
            <div class="quiz-question">
                <h4>Q${i+1}: ${q.question}</h4>
                <p>${isCorrect ? '✅' : '❌'} Your answer: ${q.options[selectedIdx]}</p>
                ${!isCorrect ? `<p>✅ Correct answer: ${q.options[q.correct_answer]}</p>` : ''}
                <details><summary>Explanation</summary><div class="flashcard-answer">${q.explanation}</div></details>
            </div>
        `;
    });

    html = `<h3>Score: ${score} / ${currentQuizData.length}</h3><hr>` + html + 
           `<button class="action-btn" onclick="renderQuizForm()">Retake Quiz</button>`;
           
    document.getElementById('quiz-container').innerHTML = html;
}

function showLoading() {
    const lines = [
        "🚀 Processing your notes... Grab a coffee! ☕",
        "🧠 Sharpening the pencils... and our neural networks.",
        "📚 Scanning the pages for the good stuff...",
        "⚡ Charging the brain cells. Stand by...",
        "🧐 Finding the 'A+' material for you...",
        "🛠️ Breaking down complex ideas into bite-sized bits.",
        "✨ Polishing your study guide to perfection."
    ];

    // Pick a random line
    const randomLine = lines[Math.floor(Math.random() * lines.length)];
    
    // Set the text
    document.getElementById('loading-text').innerText = randomLine;
    
    // Show the loading container
    document.getElementById('loading').classList.remove('hidden');
}