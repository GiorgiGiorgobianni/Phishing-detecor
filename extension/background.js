/**
 * 
 *  "ხიდი" ფრონტს და ბექს შორის
 *
 *   1. ANALYZE_EMAIL ფეილოუდების მოსმენა content.js-დან
 *   2. POST-ით მეილის დატას გაგზავნა ბექენდში ანალიზისთვის
 *   3. ბექენდიდან ნორმალიზებული პასუხის(ასევე ერორის) დაბრუნება content.js-ში
 *

 */

const BACKEND_URL = "http://localhost:8000/api/v1/analyze";

// რექვესტის დადროფვა თუ ძალიან დიდ ხანს მოანდომებს
const REQUEST_TIMEOUT_MS = 8000;


async function analyzeEmail(payload) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email_body: payload?.emailBody ?? "",
        sender_address: payload?.senderAddress ?? "",
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      // მიაღწია სერვერს, მაგერამ დააბრუნა არა-2xx სტატუსო
      return {
        error: true,
        errorType: "http",
        status: response.status,
        message: `Backend responded with HTTP ${response.status}.`,
      };
    }

    const data = await response.json();
    return { error: false, data };
  } catch (err) {
    clearTimeout(timeoutId);

    
    const isTimeout = err && err.name === "AbortError";
    return {
      error: true,
      errorType: isTimeout ? "timeout" : "network",
      message: isTimeout
        ? "Analysis request timed out."
        : "Backend server is offline or unreachable. Start the API on localhost:8000.",
    };
  }
}

// content script -> background -> backend -> content script.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message && message.type === "ANALYZE_EMAIL") {
    analyzeEmail(message.payload)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({
          error: true,
          errorType: "unknown",
          message: String((err && err.message) || err),
        });
      });


    return true;
  }

  
  return false;
});
