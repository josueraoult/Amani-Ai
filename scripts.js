// scripts.js - Sogo Chat AI (version ultra-économique)
const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const stopResponseBtn = document.querySelector("#stop-response-btn");
const deleteChatsBtn = document.querySelector("#delete-chats-btn");
const addFileBtn = document.querySelector("#add-file-btn");
const cancelFileBtn = document.querySelector("#cancel-file-btn");
const audioRecordBtn = document.querySelector("#audio-record-btn");

// Configuration Gemini - Modèle économique
const API_KEY = "AIzaSyAkxN8Qj4NymX1kJOl_dMZbbxc4sDB_-bk";
const MODEL = "gemini-2.0-flash-lite"; // Modèle le plus économique en tokens
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

let typingInterval = null;
let knowledgeBase = { categories: [] };
let conversationHistory = [];
let currentFile = null;
let lastRequestTime = 0;
let requestQueue = [];
let isProcessingQueue = false;

// Détection langue
const userLanguage = navigator.language || 'en';
const isFrench = userLanguage.startsWith('fr');
const isEnglish = userLanguage.startsWith('en');
const currentLang = isFrench ? 'fr' : (isEnglish ? 'en' : 'sw');

// ----- Rate Limiting intelligent -----
const MIN_DELAY_MS = 2000; // 2 secondes minimum entre requêtes
const MAX_RETRIES = 3;

async function waitForRateLimit() {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_DELAY_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_DELAY_MS - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();
}

async function queueRequest(fn) {
  return new Promise((resolve, reject) => {
    requestQueue.push({ fn, resolve, reject });
    processQueue();
  });
}

async function processQueue() {
  if (isProcessingQueue || requestQueue.length === 0) return;
  isProcessingQueue = true;
  while (requestQueue.length > 0) {
    await waitForRateLimit();
    const { fn, resolve, reject } = requestQueue.shift();
    try {
      const result = await fn();
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }
  isProcessingQueue = false;
}

// ----- Audio : enregistrement -----
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = null;
let recordingInterval = null;
let isRecording = false;
let audioModal = null;

function ensureAudioModal() {
  if (audioModal) return audioModal;
  audioModal = document.getElementById('audio-modal');
  if (!audioModal) {
    audioModal = document.createElement('div');
    audioModal.id = 'audio-modal';
    audioModal.className = 'audio-modal';
    audioModal.style.display = 'none';
    audioModal.innerHTML = `
      <div class="audio-modal-content">
        <span class="material-symbols-rounded audio-icon">mic</span>
        <div class="audio-timer">00:00</div>
        <div class="audio-wave"><span></span><span></span><span></span><span></span><span></span></div>
        <div class="audio-actions">
          <button id="audio-send-btn" class="audio-btn send"><span class="material-symbols-rounded">send</span></button>
          <button id="audio-cancel-btn" class="audio-btn cancel"><span class="material-symbols-rounded">close</span></button>
        </div>
      </div>
    `;
    document.body.appendChild(audioModal);
  }
  return audioModal;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = (seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}

function startRecording() {
  if (isRecording) return;
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      mediaRecorder = new MediaRecorder(stream);
      audioChunks = [];
      mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
      mediaRecorder.onstop = () => stream.getTracks().forEach(t => t.stop());
      mediaRecorder.start(100);
      isRecording = true;
      recordingStartTime = Date.now();
      if (recordingInterval) clearInterval(recordingInterval);
      recordingInterval = setInterval(() => {
        if (!isRecording) return;
        const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
        const timerDiv = document.querySelector('.audio-timer');
        if (timerDiv) timerDiv.innerText = formatTime(elapsed);
      }, 1000);
      ensureAudioModal().style.display = 'flex';
    })
    .catch(err => {
      console.error(err);
      alert(currentLang === 'fr' ? 'Microphone inaccessible' : 'Cannot access microphone');
    });
}

function cancelRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.onstop = () => {};
    mediaRecorder.stop();
  }
  isRecording = false;
  clearInterval(recordingInterval);
  if (audioModal) audioModal.style.display = 'none';
}

async function sendRecording() {
  if (!mediaRecorder || mediaRecorder.state === 'inactive') return;
  
  mediaRecorder.onstop = async () => {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const audioUrl = URL.createObjectURL(audioBlob);
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
    
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Audio = reader.result.split(',')[1];
      
      currentFile = {
        fileName: `audio_${Date.now()}.webm`,
        data: base64Audio,
        mime_type: 'audio/webm',
        isImage: false,
        isAudio: true,
        duration: duration
      };
      
      const userMessageText = currentLang === 'fr' ? 'Message vocal' : 'Voice message';
      const userMsgHTML = `<p class="message-text">${userMessageText}</p><div class="audio-message"><span class="material-symbols-rounded">mic</span><span class="audio-duration">${formatTime(duration)}</span></div>`;
      const userMsgDiv = createMessageElement(userMsgHTML, "user-message");
      chatsContainer.appendChild(userMsgDiv);
      scrollToBottom();
      
      const typingDiv = createMessageElement(`<div class="typing-indicator"><span></span><span></span><span></span></div>`, "bot-message", "typing-container");
      chatsContainer.appendChild(typingDiv);
      scrollToBottom();
      document.body.classList.add("chats-active", "bot-responding");
      
      await generateGeminiResponse("Analyse cet audio", null, currentFile, typingDiv);
      
      currentFile = null;
      URL.revokeObjectURL(audioUrl);
    };
    reader.readAsDataURL(audioBlob);
    if (audioModal) audioModal.style.display = 'none';
  };
  mediaRecorder.stop();
  isRecording = false;
  clearInterval(recordingInterval);
}

// ----- Chargement knowledge.json (compressé) -----
async function loadKnowledgeBase() {
  try {
    const response = await fetch('knowledge.json?t=' + Date.now());
    if (!response.ok) throw new Error();
    knowledgeBase = await response.json();
    if (!knowledgeBase.categories) knowledgeBase.categories = [];
    console.log("✅ Base chargée");
  } catch (error) {
    console.warn("Base introuvable");
    knowledgeBase = { categories: [] };
  }
  initConversation();
}

// Prompt système ultra-court pour économiser les tokens
function initConversation() {
  let knowledgeText = "";
  for (const cat of knowledgeBase.categories) {
    for (const item of cat.items) {
      knowledgeText += `${item.nom}: ${item.mots_cles.join(',')}|`;
    }
  }
  
  // Prompt système très concis (moins de 500 tokens)
  const systemPrompt = `Sogo AI, assistant sage. Réponds en 2-3 phrases max.

Savoir: ${knowledgeText.substring(0, 800)}

Règles: ${currentLang === 'fr' ? 'Parle français. Santé→utilise savoir. Termine par 🕊️' : (currentLang === 'en' ? 'Speak English. Health→use knowledge. End with 🕊️' : 'Sema Kiswahili. Afya→tumia maarifa. Malizia na 🕊️')}`;

  conversationHistory = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "🕊️" }] }
  ];
}

// ----- Fonctions UI -----
function createMessageElement(content, ...classes) {
  const div = document.createElement("div");
  div.classList.add("message", ...classes);
  div.innerHTML = content;
  return div;
}

function scrollToBottom() {
  container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;'));
}

// Message user avec bouton réessayer
function createUserMessageElement(message, file = null, isImage = false, imageData = null, isAudio = false, audioDuration = null) {
  const div = document.createElement("div");
  div.classList.add("message", "user-message");
  let inner = `<p class="message-text">${escapeHtml(message)}</p>`;
  
  if (isAudio && file) {
    inner += `<div class="audio-message"><span class="material-symbols-rounded">mic</span><span class="audio-duration">${formatTime(audioDuration || 0)}</span></div>`;
  } else if (file && isImage && imageData) {
    inner += `<img src="${imageData}" class="img-attachment" style="max-width: 150px; border-radius: 12px; margin-top: 8px;" />`;
  }
  
  inner += `<button class="retry-msg-btn" title="Retry"><span class="material-symbols-rounded">refresh</span></button>`;
  div.innerHTML = inner;
  div.querySelector('.retry-msg-btn').addEventListener('click', () => retryUserMessage(message, file, isImage, imageData, isAudio, audioDuration));
  return div;
}

async function retryUserMessage(message, file, isImage, imageData, isAudio, audioDuration) {
  if (document.body.classList.contains("bot-responding")) return;
  
  let fileToSend = null;
  if (isAudio && file) {
    fileToSend = { fileName: file, data: imageData, mime_type: 'audio/webm', isAudio: true, duration: audioDuration };
  } else if (file && isImage && imageData) {
    fileToSend = { fileName: file, data: imageData.split(',')[1], mime_type: 'image/jpeg', isImage: true };
  }
  
  const typingDiv = createMessageElement(`<div class="typing-indicator"><span></span><span></span><span></span></div>`, "bot-message", "typing-container");
  chatsContainer.appendChild(typingDiv);
  scrollToBottom();
  document.body.classList.add("bot-responding");
  await generateGeminiResponse(message, null, fileToSend, typingDiv);
}

// Effet de frappe accéléré
function typingEffect(text, textElement, onComplete) {
  textElement.textContent = "";
  const chars = text.split("");
  let idx = 0;
  if (typingInterval) clearInterval(typingInterval);
  typingInterval = setInterval(() => {
    if (idx < chars.length) {
      textElement.textContent += chars[idx];
      idx++;
      scrollToBottom();
    } else {
      clearInterval(typingInterval);
      typingInterval = null;
      if (onComplete) onComplete();
    }
  }, 20); // Plus rapide
}

// Appel Gemini avec rate limiting et retry
async function callGeminiWithRetry(payload, retryCount = 0) {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (response.status === 429) { // Rate limit
      if (retryCount < MAX_RETRIES) {
        const waitTime = (retryCount + 1) * 3000;
        console.log(`Rate limit, attente ${waitTime}ms...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        return callGeminiWithRetry(payload, retryCount + 1);
      }
      throw new Error("Quota temporairement épuisé. Réessaie dans 1 minute.");
    }
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    throw error;
  }
}

async function generateGeminiResponse(userMessage, botMsgDiv, attachedFile = null, typingIndicatorDiv = null) {
  return queueRequest(async () => {
    const messageParts = [];
    if (userMessage && userMessage.trim()) messageParts.push({ text: userMessage.substring(0, 200) }); // Limite la longueur
    
    if (attachedFile?.isImage) {
      messageParts.push({ inlineData: { mimeType: attachedFile.mime_type, data: attachedFile.data } });
    } else if (attachedFile?.isAudio) {
      messageParts.push({ text: `[Audio ${formatTime(attachedFile.duration || 0)}]` });
    }
    
    conversationHistory.push({ role: "user", parts: messageParts });
    
    // Historique très limité (max 8 messages)
    if (conversationHistory.length > 10) {
      conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-7)];
    }
    
    const payload = {
      contents: conversationHistory,
      generationConfig: { temperature: 0.5, maxOutputTokens: 200 } // Réduit pour économie
    };
    
    try {
      const data = await callGeminiWithRetry(payload);
      const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!reply) throw new Error("Réponse vide");
      
      conversationHistory.push({ role: "model", parts: [{ text: reply }] });
      
      if (typingIndicatorDiv?.parentNode) typingIndicatorDiv.remove();
      
      const finalBotDiv = createMessageElement(`<img class="avatar" src="assets/avatar.png" alt="Sogo" /><p class="message-text"></p>`, "bot-message");
      chatsContainer.appendChild(finalBotDiv);
      scrollToBottom();
      const textElement = finalBotDiv.querySelector(".message-text");
      
      return new Promise((resolve) => {
        typingEffect(reply, textElement, () => {
          document.body.classList.remove("bot-responding");
          resolve();
        });
      });
    } catch (error) {
      console.error("Erreur:", error);
      if (typingIndicatorDiv?.parentNode) typingIndicatorDiv.remove();
      const errorMsg = currentLang === 'fr' ? `⚠️ ${error.message.substring(0, 80)}` : `⚠️ ${error.message.substring(0, 80)}`;
      const errorDiv = createMessageElement(`<img class="avatar" src="assets/avatar.png" alt="Sogo" /><p class="message-text" style="color:#d62939;">${errorMsg}</p>`, "bot-message");
      chatsContainer.appendChild(errorDiv);
      scrollToBottom();
      document.body.classList.remove("bot-responding");
    }
  });
}

// Gestion envoi formulaire
const handleFormSubmit = async (e) => {
  e.preventDefault();
  const userMessage = promptInput.value.trim();
  if ((!userMessage && !currentFile) || document.body.classList.contains("bot-responding")) return;
  
  const messageToSend = userMessage || (currentFile?.isImage ? "Image" : (currentFile?.isAudio ? "Audio" : "Message"));
  const fileToSend = currentFile;
  const previewUrl = fileUploadWrapper?.querySelector(".file-preview")?.src;
  const isAudio = fileToSend?.isAudio || false;
  const audioDuration = fileToSend?.duration || 0;
  
  promptInput.value = "";
  currentFile = null;
  fileUploadWrapper?.classList.remove("active", "img-attached", "file-attached");
  document.body.classList.add("chats-active", "bot-responding");
  
  const userMsgDiv = createUserMessageElement(messageToSend, fileToSend?.fileName, fileToSend?.isImage || false, previewUrl, isAudio, audioDuration);
  chatsContainer.appendChild(userMsgDiv);
  scrollToBottom();
  
  const typingDiv = createMessageElement(`<div class="typing-indicator"><span></span><span></span><span></span></div>`, "bot-message", "typing-container");
  chatsContainer.appendChild(typingDiv);
  scrollToBottom();
  
  await generateGeminiResponse(messageToSend, null, fileToSend, typingDiv);
};

// Setup audio button
function setupAudioButton() {
  if (!audioRecordBtn) return;
  audioRecordBtn.addEventListener('click', startRecording);
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('#audio-send-btn')) sendRecording();
    if (e.target.closest('#audio-cancel-btn')) cancelRecording();
  });
}

// Gestion fichiers
addFileBtn?.addEventListener("click", () => fileInput.click());
fileInput?.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  if (file.type.startsWith("image/")) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target.result.split(",")[1];
      const preview = e.target.result;
      fileUploadWrapper.querySelector(".file-preview").src = preview;
      fileUploadWrapper.classList.add("active", "img-attached");
      currentFile = { fileName: file.name, data: base64, mime_type: file.type, isImage: true, isAudio: false };
      fileInput.value = "";
    };
    reader.readAsDataURL(file);
  } else {
    alert(currentLang === 'fr' ? 'Seules les images sont supportées' : 'Only images supported');
    fileInput.value = "";
  }
});

cancelFileBtn?.addEventListener("click", () => {
  currentFile = null;
  fileUploadWrapper?.classList.remove("active", "img-attached", "file-attached");
});

stopResponseBtn?.addEventListener("click", () => {
  if (typingInterval) clearInterval(typingInterval);
  document.querySelector(".bot-message.loading")?.classList.remove("loading");
  document.body.classList.remove("bot-responding");
});

deleteChatsBtn?.addEventListener("click", () => {
  chatsContainer.innerHTML = "";
  document.body.classList.remove("chats-active", "bot-responding");
  initConversation();
  if (typingInterval) clearInterval(typingInterval);
  requestQueue = [];
});

document.querySelectorAll(".suggestions-item").forEach(sugg => {
  sugg.addEventListener("click", () => {
    promptInput.value = sugg.querySelector(".text").textContent;
    handleFormSubmit(new Event("submit"));
  });
});

promptForm.addEventListener("submit", handleFormSubmit);

// Démarrage
setupAudioButton();
loadKnowledgeBase();
