// scripts.js - Umuhinga AI (version stable sans AbortController)
const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = document.querySelector(".file-upload-wrapper");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const stopResponseBtn = document.querySelector("#stop-response-btn");
const deleteChatsBtn = document.querySelector("#delete-chats-btn");
const addFileBtn = document.querySelector("#add-file-btn");
const cancelFileBtn = document.querySelector("#cancel-file-btn");

// TA NOUVELLE CLÉ API ICI (générée sur https://aistudio.google.com/apikey)
const API_KEY = "AIzaSyAPP-FXg0YWC6W-E6wPBNWaaVgS3t4dU6I"; // ← REMPLACE PAR TA VRAIE NOUVELLE CLÉ
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${API_KEY}`;

let currentFetchRequest = null; // Pour pouvoir annuler si besoin
let typingInterval = null;
let knowledgeBase = { categories: [] };
let chatHistory = [];

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
    buildSystemPrompt();
  } catch (error) {
    console.warn("⚠️ knowledge.json introuvable", error);
    knowledgeBase = { categories: [] };
    buildSystemPrompt();
  }
}

// ------------------- 2. Construction du prompt système -------------------
function buildSystemPrompt() {
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

CONNAISSANCES TRADITIONNELLES (utilise-les précisément si la question concerne ces sujets) :
${knowledgeText || "Aucune connaissance spécifique pour l'instant."}

RÈGLES :
- Réponds dans la langue de l'utilisateur (${langInstruction}).
- Si la question concerne un sujet présent dans les connaissances ci-dessus, utilise précisément ces informations.
- Si la question est générale (code, conversation, etc.), réponds normalement mais reste dans le rôle d'un sage africain.
- Sois utile, concis et chaleureux. Utilise des émojis.
- Termine par : "🔔 Umuhinga – savoir traditionnel et moderne."`;
  
  // Réinitialiser l'historique avec le prompt système
  chatHistory = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Je suis prêt à t'aider avec sagesse ! 🌿" }] }
  ];
}

// ------------------- 3. Appel à Gemini -------------------
async function generateGeminiResponse(userMessage, botMsgDiv) {
  const textElement = botMsgDiv.querySelector(".message-text");
  
  // Ajouter le message utilisateur
  chatHistory.push({ role: "user", parts: [{ text: userMessage }] });
  
  // Garder les 30 derniers messages max
  const historyToSend = [chatHistory[0], ...chatHistory.slice(-30)];
  
  console.log("📤 Envoi à Gemini, historique:", historyToSend.length);
  
  try {
    // Créer un nouveau controller pour cette requête
    const controller = new AbortController();
    currentFetchRequest = controller;
    
    // Timeout de 30 secondes
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: historyToSend }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    currentFetchRequest = null;
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("Erreur API:", errorData);
      throw new Error(errorData.error?.message || `HTTP ${response.status}`);
    }
    
    const data = await response.json();
    console.log("📥 Réponse Gemini reçue");
    
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error("Réponse vide");
    
    // Ajouter la réponse à l'historique
    chatHistory.push({ role: "model", parts: [{ text: reply }] });
    
    typingEffect(reply, textElement, botMsgDiv);
    
  } catch (error) {
    console.error("❌ Gemini error:", error.message);
    
    let friendlyError = "";
    if (error.name === "AbortError") {
      friendlyError = currentLang === 'fr' ?
        "⏹️ Réponse annulée ou trop longue à arriver." :
        "⏹️ Response cancelled or timed out.";
    } else if (error.message.includes("API key") || error.message.includes("suspended")) {
      friendlyError = currentLang === 'fr' ?
        "🔑 Clé API invalide ou suspendue. Contacte l'administrateur." :
        "🔑 Invalid or suspended API key. Contact administrator.";
    } else if (error.message.includes("Failed to fetch")) {
      friendlyError = currentLang === 'fr' ?
        "🌍 Connexion impossible. Vérifie que ton navigateur autorise les requêtes sécurisées (HTTPS). Essaie avec un serveur local comme Live Server." :
        "🌍 Cannot connect. Check your browser allows secure requests. Try using Live Server.";
    } else {
      friendlyError = currentLang === 'fr' ?
        "❌ Erreur: " + error.message :
        "❌ Error: " + error.message;
    }
    
    textElement.textContent = friendlyError;
    textElement.style.color = "#d62939";
    botMsgDiv.classList.remove("loading");
    document.body.classList.remove("bot-responding");
    scrollToBottom();
  } finally {
    currentFetchRequest = null;
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
  return str.replace(/[&<>]/g, function(m) {
    return m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;');
  });
}

// ------------------- 6. Gestion du formulaire -------------------
const handleFormSubmit = async (e) => {
  e.preventDefault();
  const userMessage = promptInput.value.trim();
  if (!userMessage || document.body.classList.contains("bot-responding")) return;
  
  promptInput.value = "";
  document.body.classList.add("chats-active", "bot-responding");
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
  
  // Afficher message utilisateur
  const userMsgHTML = `<p class="message-text">${escapeHtml(userMessage)}</p>`;
  const userMsgDiv = createMessageElement(userMsgHTML, "user-message");
  chatsContainer.appendChild(userMsgDiv);
  scrollToBottom();
  
  // Afficher réflexion du bot
  const thinking = currentLang === 'fr' ? "🌿 Umuhinga réfléchit..." : (currentLang === 'en' ? "🌿 Umuhinga is thinking..." : "🌿 Umuhinga anafikiri...");
  const botMsgHTML = `<img class="avatar" src="assets/avatar.png" alt="Umuhinga" /> <p class="message-text">${thinking}</p>`;
  const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();
  
  await generateGeminiResponse(userMessage, botMsgDiv);
};

// ------------------- 7. Arrêt de la réponse -------------------
stopResponseBtn?.addEventListener("click", () => {
  if (currentFetchRequest) {
    currentFetchRequest.abort();
    currentFetchRequest = null;
  }
  if (typingInterval) clearInterval(typingInterval);
  const loadingMsg = chatsContainer.querySelector(".bot-message.loading");
  if (loadingMsg) loadingMsg.classList.remove("loading");
  document.body.classList.remove("bot-responding");
});

// ------------------- 8. Thème clair/sombre -------------------
const isLightTheme = localStorage.getItem("themeColor") === "light_mode";
document.body.classList.toggle("light-theme", isLightTheme);
themeToggleBtn.textContent = isLightTheme ? "dark_mode" : "light_mode";

themeToggleBtn.addEventListener("click", () => {
  const isLight = document.body.classList.toggle("light-theme");
  localStorage.setItem("themeColor", isLight ? "light_mode" : "dark_mode");
  themeToggleBtn.textContent = isLight ? "dark_mode" : "light_mode";
});

// ------------------- 9. Supprimer l'historique -------------------
deleteChatsBtn?.addEventListener("click", () => {
  chatsContainer.innerHTML = "";
  document.body.classList.remove("chats-active", "bot-responding");
  buildSystemPrompt(); // Réinitialise l'historique
  if (typingInterval) clearInterval(typingInterval);
  if (currentFetchRequest) currentFetchRequest.abort();
});

// ------------------- 10. Suggestions -------------------
document.querySelectorAll(".suggestions-item").forEach((sugg) => {
  sugg.addEventListener("click", () => {
    promptInput.value = sugg.querySelector(".text").textContent;
    handleFormSubmit(new Event("submit"));
  });
});

// ------------------- 11. Gestion fichiers -------------------
addFileBtn?.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  const isImage = file.type.startsWith("image/");
  const reader = new FileReader();
  reader.readAsDataURL(file);
  reader.onload = (e) => {
    fileInput.value = "";
    const base64String = e.target.result.split(",")[1];
    fileUploadWrapper.querySelector(".file-preview").src = e.target.result;
    fileUploadWrapper.classList.add("active", isImage ? "img-attached" : "file-attached");
  };
});

cancelFileBtn?.addEventListener("click", () => {
  fileUploadWrapper.classList.remove("file-attached", "img-attached", "active");
});

// ------------------- 12. Cacher contrôles -------------------
document.addEventListener("click", ({ target }) => {
  const wrapper = document.querySelector(".prompt-wrapper");
  if (wrapper && target.classList?.contains("prompt-input")) {
    wrapper.classList.add("hide-controls");
  } else if (wrapper && !target.classList?.contains("prompt-input")) {
    wrapper.classList.remove("hide-controls");
  }
});

// ------------------- Démarrage -------------------
promptForm.addEventListener("submit", handleFormSubmit);
loadKnowledgeBase();
