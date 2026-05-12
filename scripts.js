// scripts.js - Umuhinga AI (version ultra-light sans knowledge.json)
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
const MODEL = "gemini-2.0-flash-lite";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

let typingInterval = null;
let conversationHistory = [];
let currentFile = null;

// Détection langue
const userLanguage = navigator.language || 'en';
const isFrench = userLanguage.startsWith('fr');
const isEnglish = userLanguage.startsWith('en');
const currentLang = isFrench ? 'fr' : (isEnglish ? 'en' : 'sw');

// ----- Audio : enregistrement et envoi comme fichier -----
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

function showAudioModal() { ensureAudioModal().style.display = 'flex'; }
function hideAudioModal() { if (audioModal) audioModal.style.display = 'none'; }

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
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
      };
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
      showAudioModal();
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
  hideAudioModal();
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
      const userMsgHTML = `
        <p class="message-text">${userMessageText}</p>
        <div class="audio-message">
          <span class="material-symbols-rounded">mic</span>
          <span class="audio-duration">${formatTime(duration)}</span>
        </div>
      `;
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
    hideAudioModal();
  };
  mediaRecorder.stop();
  isRecording = false;
  clearInterval(recordingInterval);
}

// Setup audio button
function setupAudioButton() {
  if (!audioRecordBtn) return;
  audioRecordBtn.addEventListener('click', startRecording);
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('#audio-send-btn')) sendRecording();
    if (e.target.closest('#audio-cancel-btn')) cancelRecording();
  });
}

// ----- Initialisation conversation (sans knowledge.json) -----
function initConversation() {
  const langInst = currentLang === 'fr' ? 'français' : (currentLang === 'en' ? 'english' : 'swahili');
  const systemPrompt = `Assistant IA sage. Parle ${langInst}. Réponds en 2-3 phrases max, concis et utile. Pour la santé, conseille un médecin. Termine par 🕊️.`;
  
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

// Création message user avec bouton réessayer
function createUserMessageElement(message, file = null, isImage = false, imageData = null, isAudio = false, audioDuration = null) {
  const div = document.createElement("div");
  div.classList.add("message", "user-message");
  let inner = `<p class="message-text">${escapeHtml(message)}</p>`;
  
  if (isAudio && file) {
    inner += `<div class="audio-message">
      <span class="material-symbols-rounded">mic</span>
      <span class="audio-duration">${formatTime(audioDuration || 0)}</span>
    </div>`;
  } else if (file && isImage && imageData) {
    inner += `<img src="${imageData}" class="img-attachment" style="max-width: 150px; border-radius: 12px; margin-top: 8px;" />`;
  }
  
  inner += `<button class="retry-msg-btn" title="${currentLang === 'fr' ? 'Renvoyer' : 'Retry'}">
    <span class="material-symbols-rounded">refresh</span>
  </button>`;
  div.innerHTML = inner;
  
  const retryBtn = div.querySelector('.retry-msg-btn');
  retryBtn.addEventListener('click', () => retryUserMessage(message, file, isImage, imageData, isAudio, audioDuration));
  return div;
}

async function retryUserMessage(message, file, isImage, imageData, isAudio, audioDuration) {
  if (document.body.classList.contains("bot-responding")) return;
  
  let fileToSend = null;
  if (isAudio && file) {
    fileToSend = { fileName: file, data: imageData, mime_type: 'audio/webm', isImage: false, isAudio: true, duration: audioDuration };
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
  }, 20);
}

// Appel Gemini optimisé (max tokens réduit)
async function generateGeminiResponse(userMessage, botMsgDiv, attachedFile = null, typingIndicatorDiv = null) {
  const messageParts = [];
  // Limite le message à 200 caractères
  if (userMessage && userMessage.trim()) {
    messageParts.push({ text: userMessage.substring(0, 200) });
  }
  
  if (attachedFile) {
    if (attachedFile.isImage) {
      messageParts.push({ inlineData: { mimeType: attachedFile.mime_type, data: attachedFile.data } });
    } else if (attachedFile.isAudio) {
      messageParts.push({ text: `[Audio ${formatTime(attachedFile.duration || 0)}]` });
    }
  }
  
  conversationHistory.push({ role: "user", parts: messageParts });
  
  // Historique limité à 10 messages max
  if (conversationHistory.length > 12) {
    conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-9)];
  }
  
  const payload = {
    contents: conversationHistory,
    generationConfig: { 
      temperature: 0.5, 
      maxOutputTokens: 200  // Réduit pour économie
    }
  };
  
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error("Réponse vide");
    
    conversationHistory.push({ role: "model", parts: [{ text: reply }] });
    
    if (typingIndicatorDiv && typingIndicatorDiv.parentNode) typingIndicatorDiv.remove();
    
    const finalBotDiv = createMessageElement(`<img class="avatar" src="assets/avatar.png" alt="Umuhinga" /><p class="message-text"></p>`, "bot-message");
    chatsContainer.appendChild(finalBotDiv);
    scrollToBottom();
    const textElement = finalBotDiv.querySelector(".message-text");
    typingEffect(reply, textElement, () => {
      document.body.classList.remove("bot-responding");
    });
  } catch (error) {
    console.error("Erreur Gemini:", error);
    if (typingIndicatorDiv && typingIndicatorDiv.parentNode) typingIndicatorDiv.remove();
    const errorMsg = currentLang === 'fr' ? `Erreur: ${error.message.substring(0, 100)}` : `Error: ${error.message.substring(0, 100)}`;
    const errorDiv = createMessageElement(`<img class="avatar" src="assets/avatar.png" alt="Umuhinga" /><p class="message-text" style="color:#d62939;">${errorMsg}</p>`, "bot-message");
    chatsContainer.appendChild(errorDiv);
    scrollToBottom();
    document.body.classList.remove("bot-responding");
  }
}

// Gestion envoi formulaire
const handleFormSubmit = async (e) => {
  e.preventDefault();
  const userMessage = promptInput.value.trim();
  if ((!userMessage && !currentFile) || document.body.classList.contains("bot-responding")) return;
  
  const messageToSend = userMessage || (currentFile?.isImage ? (currentLang === 'fr' ? "Image" : "Image") : (currentLang === 'fr' ? "Audio" : "Audio"));
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

// Gestion fichiers (images)
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
      currentFile = {
        fileName: file.name,
        data: base64,
        mime_type: file.type,
        isImage: true,
        isAudio: false
      };
      fileInput.value = "";
    };
    reader.readAsDataURL(file);
  } else {
    alert(currentLang === 'fr' ? "Seules les images sont supportées" : "Only images supported");
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
});

document.querySelectorAll(".suggestions-item").forEach(sugg => {
  sugg.addEventListener("click", () => {
    promptInput.value = sugg.querySelector(".text").textContent;
    handleFormSubmit(new Event("submit"));
  });
});

promptForm.addEventListener("submit", handleFormSubmit);

// Démarrage
initConversation();
setupAudioButton();
