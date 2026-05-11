// scripts.js - Umuhinga AI avec Gemini API (version navigateur pur)
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

// Configuration Gemini - utilisant gemini-2.0-flash (disponible et stable)
const API_KEY = "AIzaSyAPP-FXg0YWC6W-E6wPBNWaaVgS3t4dU6I"; // ⚠️ Remplace par ta nouvelle clé générée sur AI Studio
const MODEL = "gemini-2.0-flash"; // Modèle disponible (gemini-3-flash-preview n'existe pas encore)
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

let currentAbortController = null;
let typingInterval = null;
let knowledgeBase = { categories: [] };
let chatHistory = []; // Historique pour conversations multitours

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
    initChatHistory();
  } catch (error) {
    console.warn("⚠️ knowledge.json introuvable, création d'une base vide");
    knowledgeBase = { categories: [] };
    initChatHistory();
  }
}

// ------------------- 2. Initialisation de l'historique avec instructions système -------------------
function initChatHistory() {
  // Construire le système prompt avec les connaissances
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

  // Format d'historique compatible avec l'API Gemini (role: "user" ou "model")
  chatHistory = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Je suis prêt à t'aider avec sagesse ! 🌿" }] }
  ];
}

// ------------------- 3. Appel à l'API Gemini (multitours) -------------------
async function generateGeminiResponse(userMessage, botMsgDiv) {
  const textElement = botMsgDiv.querySelector(".message-text");
  
  // Ajouter le message utilisateur à l'historique
  chatHistory.push({ role: "user", parts: [{ text: userMessage }] });

  // Préparer le payload complet (historique complet pour contexte multitours)
  const payload = {
    contents: chatHistory,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800,
    }
  };

  console.log("📤 Envoi à Gemini - Historique:", chatHistory.length, "messages");

  try {
    // Créer un nouvel abort controller
    currentAbortController = new AbortController();
    
    // Timeout de 45 secondes
    const timeoutId = setTimeout(() => {
      if (currentAbortController) {
        currentAbortController.abort();
      }
    }, 45000);

    const response = await fetch(`${API_URL}?key=${API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: currentAbortController.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ API Error:", errorData);
      let errorMsg = errorData.error?.message || `HTTP ${response.status}`;
      throw new Error(errorMsg);
    }

    const data = await response.json();
    console.log("✅ Réponse Gemini reçue");

    // Extraire le texte de la réponse
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) throw new Error("Réponse vide");

    // Ajouter la réponse à l'historique
    chatHistory.push({ role: "model", parts: [{ text: reply }] });
    
    // Limiter la taille de l'historique (conserver les 30 derniers échanges)
    if (chatHistory.length > 60) {
      // Garder le premier message (système) + les 30 derniers
      chatHistory = [chatHistory[0], ...chatHistory.slice(-30)];
    }
    
    typingEffect(reply, textElement, botMsgDiv);

  } catch (error) {
    console.error("❌ Gemini error:", error.name, error.message);
    
    let friendlyError = "";
    if (error.name === "AbortError") {
      friendlyError = currentLang === 'fr' 
        ? "⏹️ La réponse a pris trop de temps. Réessaie."
        : "⏹️ Response took too long. Try again.";
    } else if (error.message.includes("API key") || error.message.includes("suspended") || error.message.includes("permission")) {
      friendlyError = currentLang === 'fr'
        ? "🔑 Clé API invalide. Génére une nouvelle clé sur https://aistudio.google.com/apikey"
        : "🔑 Invalid API key. Generate a new key at https://aistudio.google.com/apikey";
    } else if (error.message.includes("404")) {
      friendlyError = currentLang === 'fr'
        ? "📡 Modèle non trouvé. Utilise gemini-2.0-flash au lieu de gemini-3-flash-preview"
        : "📡 Model not found. Use gemini-2.0-flash instead of gemini-3-flash-preview";
    } else if (error.message.includes("fetch")) {
      friendlyError = currentLang === 'fr'
        ? "🌍 Connexion impossible. Lance le site avec Live Server (pas en fichier local)."
        : "🌍 Cannot connect. Run the site with Live Server (not as local file).";
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
  fileUploadWrapper?.classList.remove("file-attached", "img-attached", "active");

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
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
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
  initChatHistory(); // Réinitialise l'historique
  if (typingInterval) clearInterval(typingInterval);
  if (currentAbortController) currentAbortController.abort();
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

fileInput?.addEventListener("change", () => {
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
  fileUploadWrapper?.classList.remove("file-attached", "img-attached", "active");
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
