/**
 * 
 * აფიქსირებს მეილის გახსნას Gmail და Outlook ვებ სერვისებში, აექსტრაქტებს შიგთავსს 
 * და აგზავნის ბექენდში(background.js-ის მეშვეობით) დასკვნისთვის.
 */

(() => {
  "use strict";

  const HOST = location.hostname;
  const IS_GMAIL = HOST.includes("mail.google.com");
  const IS_OUTLOOK = HOST.includes("outlook.live.com");

  const MIN_BODY_CHARS = 40;
  // 600 მილიწამის შემდეგ მოახდინოს რეაგირება, რათა თითოეულ ოპერაციაზე არ დაისტარტოს და შეანელოს პროცესები.
  const SCAN_DEBOUNCE_MS = 600;
  const BANNER_CLASS = "pg-alert-banner";

  // იმახსოვრებს მეილებს, რომლებიც უკვე გავაანალიზეთ მიმდინარე სესიაში, ადუპლიკატებს ბანერებს და
  // გამოაქვს როცა შესაბამის შიგთავსისა და გამომგზავნის ჰეშს დააფიქსირებს

  const seenKeys = new Set();

  // ჩართვა/გამორთვის სვიჩი, რომელსაც გაფართოებიდან ვაკონტროლებთ.
  let scanningEnabled = true;
  try {
    chrome.storage?.local.get({ enabled: true }, (res) => {
      scanningEnabled = res.enabled !== false;
    });
    chrome.storage?.onChanged.addListener((changes, area) => {
      if (area === "local" && changes.enabled) {
        scanningEnabled = changes.enabled.newValue !== false;
      }
    });
  } catch {

  }

  // --- მარტივი ჰეშირება -----------------------
  function hashString(str) {
    let hash = 5381; //djb2 ჰეშის seed ნომერი
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
    }
    return (hash >>> 0).toString(36);
  }

  function extractEmailRegex(value) {
    if (!value) return "";
    const match = value.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    return match ? match[0] : "";
  }



  function extractGmail() {
    // Gmail თაგავს სენდერის სპან კონტეინერს, 'gD' ან 'email' ატრიბუტით
    const senderEl = document.querySelector("span.gD[email], .gD[email]");
    const senderAddress = senderEl
      ? senderEl.getAttribute("email") || senderEl.textContent.trim()
      : "";


    const bodies = Array.from(document.querySelectorAll("div.a3s")).filter(
      (el) => el.offsetParent !== null
    );
    const bodyEl = bodies.length ? bodies[bodies.length - 1] : null;
    const emailBody = bodyEl ? bodyEl.innerText.trim() : "";

    if (!bodyEl) return null;
    return { senderAddress, emailBody, bodyEl };
  }

  function extractOutlook() {
    const bodyEl =
      document.querySelector('[aria-label="Message body"]') ||
      document.querySelector('div[role="document"]') ||
      document.querySelector("div.allowTextSelection");
    const emailBody = bodyEl ? bodyEl.innerText.trim() : "";

    // Sender: scan a few likely elements and pull the first email-looking string.
    const senderCandidate =
      document.querySelector('span[title*="@"]') ||
      document.querySelector('[aria-label*="@"]');
    const senderAddress = senderCandidate
      ? extractEmailRegex(
          senderCandidate.getAttribute("title") ||
            senderCandidate.getAttribute("aria-label") ||
            senderCandidate.textContent
        )
      : "";

    if (!bodyEl) return null;
    return { senderAddress, emailBody, bodyEl };
  }

  function extractOpenEmail() {
    if (IS_GMAIL) return extractGmail();
    if (IS_OUTLOOK) return extractOutlook();
    return null;
  }

  // --- ბანერის UI ---------------------------------------------------------------

  const WARNING_ICON_SVG = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
      <path d="M12 2 1 21h22L12 2zm0 13.2a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5zM10.9 9h2.2l-.32 5.2h-1.56L10.9 9z"/>
    </svg>`;

  function buildBanner(data) {
    const percent = Math.round((data.phishing_probability || 0) * 100);

    const banner = document.createElement("div");
    banner.className = `${BANNER_CLASS} pg-alert--danger`;
    banner.setAttribute("role", "alert");

    const icon = document.createElement("div");
    icon.className = "pg-alert-icon";
    icon.innerHTML = WARNING_ICON_SVG;

    const content = document.createElement("div");
    content.className = "pg-alert-content";

    const title = document.createElement("div");
    title.className = "pg-alert-title";
    // Exact required message text:
    title.textContent =
      "Warning: AI analysis detected high risk of phishing in this email.";

    const meta = document.createElement("div");
    meta.className = "pg-alert-meta";
    meta.textContent = `Risk score: ${percent}%` + (data.reason ? ` · ${data.reason}` : "");

    content.appendChild(title);
    content.appendChild(meta);

    const dismiss = document.createElement("button");
    dismiss.className = "pg-alert-dismiss";
    dismiss.type = "button";
    dismiss.setAttribute("aria-label", "Dismiss warning");
    dismiss.textContent = "\u00D7"; // ×
    dismiss.addEventListener("click", () => banner.remove());

    banner.appendChild(icon);
    banner.appendChild(content);
    banner.appendChild(dismiss);
    return banner;
  }

  function injectBanner(bodyEl, data) {
    const anchor = bodyEl;
    const parent = anchor && anchor.parentElement;
    if (!parent) return;

    // არ გამოიტანოს ბევრი ბანერი ერთ მეილზე
    if (parent.querySelector(`.${BANNER_CLASS}`)) return;

    parent.insertBefore(buildBanner(data), anchor);
  }

  // --- შედეგი ---------------------------------------------------------

  function handleResult(response, bodyEl) {
    if (!response || response.error) {
      // თუ რესპონსი არ არის ან ერორია, არ გამოიტანოს მომხმარებლის მეილში.
      if (response && response.error) {
      // თუ რესპონსი არის და ერორია გამოიტანოს გაფრთხილება კონსოლში.
        console.warn("[AI Phishing Detector] analysis unavailable:", response.message);
      }
      return;
    }

    const data = response.data;
    if (data && data.status === "flagged") {
      injectBanner(bodyEl, data);
    }
  }

  // --- გახსნილი მეილის სკანირება ------------------------------------------------------

  function scanForOpenEmail() {
    if (!scanningEnabled) return;

    const extracted = extractOpenEmail();
    if (!extracted) return;

    const { senderAddress, emailBody, bodyEl } = extracted;
    if (!emailBody || emailBody.length < MIN_BODY_CHARS) return;

    // Dedup: skip emails we've already analyzed this session.
    const key = hashString(`${senderAddress}::${emailBody.length}::${emailBody.slice(0, 64)}`);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    try {
      chrome.runtime.sendMessage(
        { type: "ANALYZE_EMAIL", payload: { senderAddress, emailBody } },
        (response) => {
          // Swallow the "receiving end does not exist" error that can occur if the
          // worker was asleep; the next scan will retry.
          if (chrome.runtime.lastError) {
            console.warn(
              "[AI Phishing Detector] messaging error:",
              chrome.runtime.lastError.message
            );
            return;
          }
          handleResult(response, bodyEl);
        }
      );
    } catch (err) {
      console.warn("[AI Phishing Detector] failed to send message:", err);
    }
  }

  let debounceTimer = null;
  function scheduleScan() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanForOpenEmail, SCAN_DEBOUNCE_MS);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.body, { childList: true, subtree: true });


  scheduleScan();
})();
