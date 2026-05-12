// scripts.js - Umuhinga AI (version complète avec images et knowledge)
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
const MODEL = "gemini-2.0-flash";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

let typingInterval = null;
let knowledgeBase = { categories: [] };
let conversationHistory = [];
let currentFile = null;

// Détection langue
const userLanguage = navigator.language || 'en';
const isFrench = userLanguage.startsWith('fr');
const isEnglish = userLanguage.startsWith('en');
const currentLang = isFrench ? 'fr' : (isEnglish ? 'en' : 'sw');

// ------------------- 1. Chargement du JSON local -------------------
async function loadKnowledgeBase() {
  try {
    console.log("📂 Chargement de knowledge.json...");
    const response = await fetch('knowledge.json?t=' + Date.now());
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    knowledgeBase = await response.json();
    if (!knowledgeBase.categories) knowledgeBase.categories = [];
    console.log("✅ knowledge.json chargé:", knowledgeBase.categories.length, "catégories");
    initConversation();
  } catch (error) {
    console.warn("⚠️ knowledge.json introuvable, utilisation d'une base vide");
    knowledgeBase = { categories: [] };
    initConversation();
  }
}

// ------------------- 2. Initialisation avec les connaissances -------------------
function initConversation() {
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

CONNAISSANCES TRADITIONNELLES À UTILISER IMPÉRATIVEMENT :
${knowledgeText || "Aucune connaissance spécifique pour l'instant."}

RÈGLES IMPORTANTES :
1. Tu DOIS utiliser les connaissances ci-dessus pour répondre aux questions sur la santé, les plantes, les remèdes traditionnels.
2. Quand l'utilisateur envoie une image, analyse-la attentivement et réponds en fonction.
3. Réponds dans la langue de l'utilisateur (${langInstruction}).
4. Sois utile, concis et chaleureux. Utilise des émojis.
5. Termine par : "🔔 Umuhinga – savoir traditionnel et moderne."`;
  
  conversationHistory = [
    { role: "user", parts: [{ text: systemPrompt }] },
    { role: "model", parts: [{ text: "Je suis prêt à t'aider avec sagesse ! 🌿" }] }
  ];
  console.log("✅ Conversation initialisée");
}

// ------------------- 3. Appel API Gemini avec support images -------------------
async function generateGeminiResponse(userMessage, botMsgDiv, attachedFile = null) {
  const textElement = botMsgDiv.querySelector(".message-text");
  
  // Construire les parties du message (texte + image éventuelle)
  const messageParts = [];
  
  // Ajouter le texte
  if (userMessage && userMessage.trim()) {
    messageParts.push({ text: userMessage });
  }
  
  // Ajouter l'image si présente (format correct pour Gemini)
  if (attachedFile && attachedFile.data && attachedFile.isImage) {
    messageParts.push({
      inlineData: {
        mimeType: attachedFile.mime_type,
        data: attachedFile.data
      }
    });
    console.log("🖼️ Image jointe:", attachedFile.fileName, attachedFile.mime_type);
  } else if (attachedFile && !attachedFile.isImage) {
    messageParts.push({ text: `[Fichier joint: ${attachedFile.fileName}]` });
  }
  
  // Ajouter le message utilisateur à l'historique
  conversationHistory.push({ role: "user", parts: messageParts });
  
  // Limiter la taille de l'historique
  if (conversationHistory.length > 20) {
    conversationHistory = [conversationHistory[0], ...conversationHistory.slice(-18)];
  }
  
  const payload = {
    contents: conversationHistory,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 800,
    }
  };
  
  console.log("📤 Envoi à Gemini - Messages:", conversationHistory.length, "| Image:", !!attachedFile?.isImage);
  
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    
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
        ? "📊 Quota API atteint pour aujourd'hui. Réessaie demain."
        : "📊 API quota reached. Try again tomorrow.";
    } else if (error.message.includes("API key")) {
      friendlyError = currentLang === 'fr'
        ? "🔑 Clé API invalide. Génére une nouvelle clé sur https://aistudio.google.com/apikey"
        : "🔑 Invalid API key.";
    } else {
      friendlyError = currentLang === 'fr'
        ? `❌ Erreur: ${error.message.substring(0, 150)}`
        : `❌ Error: ${error.message.substring(0, 150)}`;
    }
    
    textElement.textContent = friendlyError;
    textElement.style.color = "#d62939";
    botMsgDiv.classList.remove("loading");
    document.body.classList.remove("bot-responding");
    scrollToBottom();
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
  return str.replace(/[&<>]/g, m => m === '&' ? '&amp;' : (m === '<' ? '&lt;' : '&gt;'));
}

// ------------------- 6. Gestion du formulaire -------------------
const handleFormSubmit = async (e) => {
  e.preventDefault();
  const userMessage = promptInput.value.trim();
  
  // Vérifier qu'il y a soit du texte soit un fichier
  if ((!userMessage && !currentFile) || document.body.classList.contains("bot-responding")) return;
  
  // Si pas de texte mais un fichier, message par défaut
  const messageToSend = userMessage || (currentFile?.isImage 
    ? (currentLang === 'fr' ? "Que vois-tu sur cette image ?" : "What do you see in this image?")
    : (currentLang === 'fr' ? "Analyse ce fichier" : "Analyze this file"));
  
  const fileToSend = currentFile;
  
  // Réinitialiser l'input
  promptInput.value = "";
  currentFile = null;
  fileUploadWrapper?.classList.remove("active", "img-attached", "file-attached");
  document.body.classList.add("chats-active", "bot-responding");
  
  // Afficher le message utilisateur avec l'image si présente
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
  const thinking = currentLang === 'fr' ? "🌿 Umuhinga examine..." : (currentLang === 'en' ? "🌿 Umuhinga is analyzing..." : "🌿 Umuhinga anachambua...");
  const botMsgHTML = `<img class="avatar" src="assets/avatar.png" alt="Umuhinga" /> <p class="message-text">${thinking}</p>`;
  const botMsgDiv = createMessageElement(botMsgHTML, "bot-message", "loading");
  chatsContainer.appendChild(botMsgDiv);
  scrollToBottom();
  
  await generateGeminiResponse(messageToSend, botMsgDiv, fileToSend);
};

// ------------------- 7. Gestion fichiers (upload images) -------------------
addFileBtn?.addEventListener("click", () => fileInput.click());

fileInput?.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (!file) return;
  
  const isImage = file.type.startsWith("image/");
  
  if (!isImage) {
    alert(currentLang === 'fr' ? "Seules les images sont supportées pour l'analyse." : "Only images are supported for analysis.");
    fileInput.value = "";
    return;
  }
  
  const reader = new FileReader();
  
  reader.onload = (e) => {
    const base64String = e.target.result.split(",")[1];
    const previewUrl = e.target.result;
    
    const previewImg = fileUploadWrapper?.querySelector(".file-preview");
    if (previewImg) previewImg.src = previewUrl;
    
    fileUploadWrapper?.classList.add("active", "img-attached");
    
    currentFile = {
      fileName: file.name,
      data: base64String,
      mime_type: file.type,
      isImage: true
    };
    
    console.log("📸 Image chargée:", file.name, file.type);
    fileInput.value = "";
  };
  
  reader.readAsDataURL(file);
});

cancelFileBtn?.addEventListener("click", () => {
  currentFile = null;
  fileUploadWrapper?.classList.remove("active", "img-attached", "file-attached");
});

// ------------------- 8. Événements -------------------
stopResponseBtn?.addEventListener("click", () => {
  if (typingInterval) clearInterval(typingInterval);
  document.querySelector(".bot-message.loading")?.classList.remove("loading");
  document.body.classList.remove("bot-responding");
});

// Thème clair/sombre
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
  initConversation();
  if (typingInterval) clearInterval(typingInterval);
});

// Suggestions
document.querySelectorAll(".suggestions-item").forEach(sugg => {
  sugg.addEventListener("click", () => {
    promptInput.value = sugg.querySelector(".text").textContent;
    handleFormSubmit(new Event("submit"));
  });
});

// Cacher les contrôles
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
