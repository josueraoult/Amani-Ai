// scripts.js - Umuhinga AI (version finale avec fichiers et knowledge)
const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = document.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const stopResponseBtn = document.querySelector("#stop-response-btn");
const deleteChatsBtn = document.querySelector("#delete-chats-btn");
const addFileBtn = document.querySelector("#add-file-btn");
const cancelFileBtn = document.querySelector("#cancel-file-btn");

// Configuration Gemini
const API_KEY = "AIzaSyAy33WTpswQMn9C7vDsQeOTHC8tpCoCdcg";
const MODEL = "gemini-flash-lite-latest"; // Modèle multimodal fiable
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

let currentAbortController = null;
let typingInterval = null;
let knowledgeBase = { categories: [] };
let conversationHistory = [];
let currentFile = null; // Stocker le fichier uploadé

// Détection langue
const userLanguage = navigator.language || 'en';
const isFrench = userLanguage.startsWith('fr');
const isEnglish = userLanguage.startsWith('en');
const currentLang = isFrench ? 'fr' : (isEnglish ? 'en' : 'sw');

// ------------------- 1. Chargement du JSON local -------------------
async function loadKnowledgeBase() {
  try {
    const response = await fetch('knowledge.json?t=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    knowledgeBase = await response.json();
    if (!knowledgeBase.categories) knowledgeBase.categories = [];
    console.log("✅ knowledge.json chargé", knowledgeBase);
    initConversation();
  } catch (error) {
    console.warn("⚠️ knowledge.json introuvable");
    knowledgeBase = { categories: [] };
    initConversation();
  }
}

// ------------------- 2. Initialisation avec les connaissances -------------------
function initConversation() {
  // Construction du texte de connaissances
  let knowledgeText = "";
  for (const category of knowledgeBase.categories) {
    knowledgeText += `\n📁 ${category.name} :\n`;
    for (const item of category.items) {
      knowledgeText += `- ${item.nom}\n`;
      knowledgeText += `  Mots-clés : ${item.mots_cles.join(', ')}\n`;
      if (item.preparation) knowledgeText += `  Préparation : ${item.preparation}\n`;
      if (item.posologie_adulte) knowledgeText += `  Posologie adulte : ${item.posologie_adulte}\n`;
      if (item.posologie_enfant) knowledgeText += `  Posologie enfant : ${item.posologie_enfant}\n`;
      if (item.contre_indications) knowledgeText += `  Contre-indications : ${item.contre_indications}\n`;
      knowledgeText += "\n";
    }
  }
  
  const langInstruction = currentLang === 'fr' ? "en français" : (currentLang === 'en' ? "in English" : "en swahili");
  
  const systemPrompt = `Tu es Umuhinga, un assistant africain sage, chaleureux et bienveillant, créé par Josué au Burundi. Tu parles ${langInstruction}.

CONNAISSANCES TRADITIONNELLES À UTILISER ABSOLUMENT :
${knowledgeText || "Aucune connaissance spécifique pour l'instant."}

RÈGLES IMPORTANTES :
- Tu DOIS utiliser les connaissances ci-dessus quand la question concerne un sujet présent.
- Réponds dans la langue de l'utilisateur (${langInstruction}).
- Si l'utilisateur envoie une image, analyse-la et réponds en fonction.
- Pour les questions générales (code, conversation), réponds normalement.
- Sois utile, concis et chaleureux.
- Termine par : "🔔 Umuhinga – savoir traditionnel et moderne."`;
  
  // Réinitialiser l'historique avec le prompt système
  conversationHistory = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Je suis prêt à t'aider avec sagesse ! 🌿" }] }
  ];
  console.log("✅ Conversation initialisée");
}

// ------------------- 3. Appel API Gemini avec gestion fichiers -------------------
async function generateGeminiResponse(userMessage, botMsgDiv, attachedFile = null) {
  const textElement = botMsgDiv.querySelector(".message-text");
  
  // Construire les parties du message (texte + éventuel fichier)
  const messageParts = [];
  
  // Ajouter le texte
  messageParts.push({ text: userMessage });
  
  // Ajouter un fichier si présent
  if (attachedFile && attachedFile.data) {
    if (attachedFile.isImage) {
      messageParts.push({
        inlineData: {
          mimeType: attachedFile.mime_type,
          data: attachedFile.data
        }
      });
    } else {
      // Pour les fichiers non-image, on ajoute le nom et le contenu textuel
      messageParts.push({ text: `[Fichier joint: ${attachedFile.fileName}]` });
    }
  }
  
  // Ajouter le message utilisateur à l'historique
  conversationHistory.push({ role: "user", parts: messageParts });
  
  // Garder les 20 derniers messages max
  if (conversationHistory.length > 20) {
    conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-19)];
  }
  
  const payload = {
    contents: conversationHistory,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800,
    }
  };
  
  console.log("📤 Envoi à Gemini - Messages:", conversationHistory.length);
  
  try {
    currentAbortController = new AbortController();
    const timeoutId = setTimeout(() => currentAbortController.abort(), 45000);
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: currentAbortController.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ API Error:", errorData);
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log("✅ Réponse reçue");
    
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error("Réponse vide");
    
    conversationHistory.push({ role: "model", parts: [{ text: reply }] });
    typingEffect(reply, textElement, botMsgDiv);
    
  } catch (error) {
    console.error("❌ Erreur:", error.message);
    let friendlyError = "";
    
    if (error.message.includes("quota")) {
      friendlyError = currentLang === 'fr'
        ? "📊 Quota dépassé pour aujourd'hui. Réessaie demain."
        : "📊 Quota exceeded. Try again tomorrow.";
    } else if (error.message.includes("API key")) {
      friendlyError = "🔑 Clé API invalide. Vérifie ta clé sur AI Studio.";
    } else {
      friendlyError = currentLang === 'fr'
        ? `❌ Erreur: ${error.message.substring(0, 100)}`
        : `❌ Error: ${error.message.substring(0, 100)}`;
    }
    
    textElement.textContent = friendlyError;
    textElement.style.color = "#d62939";
    botMsgDiv.classList.remove("loading");
    document.body.classList.remove("bot-responding");
    scrollToBottom();
  } finally {
    currentAbortController = null;
  }
}

// ------------------- 4. Effet de frappe -------------------
function typingEffect(text, textElement, botMsgDiv) {
  textElement.textContent = "";
  const words = text.split(" ");
  let index = 0;
  if (typingInterval) clearInterval(typingInterval);
  typingInterval = setInterval(() => {
    if (index < words.length) {
      textElement.textContent += (index === 0 ? "" : " ") + words[index];
      index++;
      scrollToBottom();
    } else {
      clearInterval(typingInterval);
      typingInterval = null;
      botMsgDiv.classList.remove("loading");
      document.body.classList.remove("bot-responding");
    }
  }, 35);
}

// ------------------- 5. Utilitaires -------------------
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
  return str.replace(/[&<>]/g, m => (m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;')));
}

// ------------------- 6. Gestion du formulaire -------------------
const handleFormSubmit = async (e) => {
  e.preventDefault();
  const userMessage = promptInput.value.trim();
  if ((!userMessage && !currentFile) || document.body.classList.contains("bot-responding")) return;
  
  const messageToSend = userMessage || (currentLang === 'fr' ? "Analyse ce fichier" : "Analyze this file");
  const fileToSend = currentFile;
  
  // Réinitialiser l'input et le fichier
  promptInput.value = "";
  currentFile = null;
  fileUploadWrapper?.classList.remove("active", "img-attached", "file-attached");
  document.body.classList.add("chats-active", "bot-responding");
  
  // Afficher le message utilisateur
  let userMsgHTML = `<p class="message-text">${escapeHtml(messageToSend)}</p>`;
  if (fileToSend && fileToSend.isImage) {
    userMsgHTML += `<img src="data:${fileToSend.mime_type};base64,${fileToSend.data}" class="img-attachment" style="max-width: 200px; border-radius: 12px; margin-top: 8px;" />`;
  } else if (fileToSend) {
    userMsgHTML += `<p class="file-attachment"><span class="material-symbols-rounded">description</span>${escapeHtml(fileToSend.fileName)}</p>`;
  }
  
  const userMsgDiv = createMessageElement(userMsgHTML, "user-message");
  chatsContainer.appendChild(userMsgDiv);
  scrollToBottom();
  
  // Afficher la réflexion du bot
  const thinking = currentLang === 'fr' ? "🌿 Umuhinga réfléchit..." : (currentLang === 'en' ? "🌿 Umuhinga is thinking..." : "🌿 Umuhinga anafikiri...");
  const botMsgHTML = `<img class="avatar" src="assets/avatar.png" alt="Umuhinga" /> <p class="message-text">${thinking}</p>`;
  const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();
  
  await generateGeminiResponse(messageToSend, botMsgDiv, fileToSend);
};

// ------------------- 7. Gestion fichiers -------------------
addFileBtn?.addEventListener("click", () => fileInput.click());

fileInput?.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  
  const isImage = file.type.startsWith("image/");
  const reader = new FileReader();
  
  reader.onload = (e) => {
    const base64String = e.target.result.split(",")[1];
    const previewUrl = e.target.result;
    
    // Prévisualisation
    const previewImg = fileUploadWrapper?.querySelector(".file-preview");
    if (previewImg) previewImg.src = previewUrl;
    
    fileUploadWrapper?.classList.add("active", isImage ? "img-attached" : "file-attached");
    
    currentFile = {
      fileName: file.name,
      data: base64String,
      mime_type: file.type,
      isImage: isImage
    };
    
    fileInput.value = ""; // Reset pour permettre re-upload
  };
  
  reader.readAsDataURL(file);
});

cancelFileBtn?.addEventListener("click", () => {
  currentFile = null;
  fileUploadWrapper?.classList.remove("active", "img-attached", "file-attached");
});

// ------------------- 8. Événements -------------------
stopResponseBtn?.addEventListener("click", () => {
  if (currentAbortController) currentAbortController.abort();
  if (typingInterval) clearInterval(typingInterval);
  document.querySelector(".bot-message.loading")?.classList.remove("loading");
  document.body.classList.remove("bot-responding");
});

// Thème
const isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";

themeToggleBtn.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light-theme");
  localStorage.setItem("themeColor", isLight ? "light_mode" : "dark_mode");
  themeToggleBtn.textContent = isLight ? "dark_mode" : "light_mode";
});

deleteChatsBtn?.addEventListener("click", () => {
  chatsContainer.innerHTML = "";
  document.body.classList.remove("chats-active", "bot-responding");
  initConversation(); // Réinitialise l'historique avec les connaissances
  if (typingInterval) clearInterval(typingInterval);
  if (currentAbortController) currentAbortController.abort();
});

// Suggestions
document.querySelectorAll(".suggestions-item").forEach(sugg => {
  sugg.addEventListener("click", () => {
    promptInput.value = sugg.querySelector(".text").textContent;
    handleFormSubmit(new Event("submit"));
  });
});

// Cacher contrôles
document.addEventListener("click", ({ target }) => {
  const wrapper = document.querySelector(".prompt-wrapper");
  if (wrapper && target.classList?.contains("prompt-input")) {
    wrapper.classList.add("hide-controls");
  } else if (wrapper && !target.classList?.contains("prompt-input")) {
    wrapper.classList.remove("hide-controls");
  }
});

promptForm.addEventListener("submit", handleFormSubmit);
loadKnowledgeBase();
