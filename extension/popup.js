/**
 * ჩართვა/გამორთვის სვიჩი და ხელმისაწვდომია თუ არა ბექენდი
 * 
 */

const HEALTH_URL = "http://localhost:8000/health";

const enabledInput = document.getElementById("enabled");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");


chrome.storage.local.get({ enabled: true }, ({ enabled }) => {
  enabledInput.checked = enabled !== false;
});

enabledInput.addEventListener("change", () => {
  chrome.storage.local.set({ enabled: enabledInput.checked });
});


function setStatus(state, text) {
  statusDot.classList.remove("online", "offline");
  if (state) statusDot.classList.add(state);
  statusText.textContent = text;
}

(async function checkBackend() {
  try {
    const res = await fetch(HEALTH_URL, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      setStatus("online", data.model_loaded ? "Online" : "Loading model…");
    } else {
      setStatus("offline", `Error ${res.status}`);
    }
  } catch {
    setStatus("offline", "Offline");
  }
})();
