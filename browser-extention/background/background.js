const DEFAULT_RUNTIME = {
  jobId: "",
  targetCount: 0,
  crawledCount: 0,
  uploadedCount: 0,
  uploadTotal: 0,
  queuedProducts: 0,
  estimatedMinutes: 0,
  done: false,
  errorMessage: "",
  isRunning: false,
  activeTabUrl: "",
};

let runtime = { ...DEFAULT_RUNTIME };
let pollingTimer = null;
let currentToken = null;

const API_BASE = "http://127.0.0.1:8000/api/crawl";

function resetRuntime() {
  runtime = { ...DEFAULT_RUNTIME };
}

function patchRuntime(patch = {}) {
  runtime = {
    ...runtime,
    ...patch,
  };
}

function getRuntimeSnapshot() {
  return { ...runtime };
}

function safeSendMessage(payload) {
  chrome.runtime.sendMessage(payload, () => {
    void chrome.runtime.lastError;
  });
}

function broadcastRuntimeUpdate() {
  safeSendMessage({
    type: "RUNTIME_UPDATE",
    runtime: getRuntimeSnapshot(),
  });
}

function broadcastUnauthorized() {
  safeSendMessage({ type: "UNAUTHORIZED" });
}

function broadcastLegacyEvents(snapshot) {
  if (snapshot.errorMessage) {
    safeSendMessage({
      type: "CRAWL_ERROR",
      error: snapshot.errorMessage,
    });
    return;
  }

  if (snapshot.done) {
    safeSendMessage({
      type: "CRAWL_FINISHED",
      queuedProducts: snapshot.queuedProducts || 0,
      estimatedMinutes: snapshot.estimatedMinutes || 0,
    });
    return;
  }

  if (
    Number(snapshot.crawledCount || 0) > 0 ||
    Number(snapshot.targetCount || 0) > 0
  ) {
    safeSendMessage({
      type: "PRODUCT_PROGRESS",
      total: snapshot.crawledCount || 0,
      target: snapshot.targetCount || 0,
    });
  }

  if (
    Number(snapshot.uploadedCount || 0) > 0 ||
    Number(snapshot.uploadTotal || 0) > 0
  ) {
    safeSendMessage({
      type: "UPLOAD_PROGRESS",
      current: snapshot.uploadedCount || 0,
      total: snapshot.uploadTotal || 0,
    });
  }
}

function broadcastAll() {
  const snapshot = getRuntimeSnapshot();
  broadcastRuntimeUpdate();
  broadcastLegacyEvents(snapshot);
}

function stopPolling() {
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

function scheduleNextPoll(delayMs = 1500) {
  stopPolling();

  pollingTimer = setTimeout(async () => {
    try {
      await pollJobProgress();
    } catch (error) {
      patchRuntime({
        isRunning: false,
        done: false,
        errorMessage: error?.message || "Không thể lấy tiến độ job",
      });
      broadcastAll();
      stopPolling();
    }
  }, delayMs);
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function startCrawlJob({ token, url, count }) {
  const res = await fetch(`${API_BASE}/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      url,
      count,
    }),
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const message = data?.detail || data?.message || "Không thể bắt đầu crawl";
    const error = new Error(message);
    error.code = res.status;
    throw error;
  }

  return data;
}

async function fetchJobProgress({ token, jobId }) {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await safeJson(res);

  if (!res.ok) {
    const message = data?.detail || data?.message || "Không lấy được tiến độ job";
    const error = new Error(message);
    error.code = res.status;
    throw error;
  }

  return data;
}

function normalizeProgressPayload(raw = {}) {
  const targetCount = Number(raw.targetCount || 0);
  const crawledCount = Number(raw.crawledCount || 0);
  const uploadedCount = Number(raw.uploadedCount || 0);
  const uploadTotal = Number(raw.uploadTotal || 0);
  const queuedProducts = Number(raw.queuedProducts || 0);
  const estimatedMinutes = Number(raw.estimatedMinutes || 0);
  const done = Boolean(raw.done);
  const errorMessage =
    typeof raw.errorMessage === "string" ? raw.errorMessage : "";

  return {
    jobId: raw.jobId || runtime.jobId || "",
    targetCount,
    crawledCount,
    uploadedCount,
    uploadTotal,
    queuedProducts,
    estimatedMinutes,
    done,
    errorMessage,
    isRunning: !done && !errorMessage,
  };
}

async function pollJobProgress() {
  if (!runtime.jobId || !currentToken) {
    return;
  }

  try {
    const raw = await fetchJobProgress({
      token: currentToken,
      jobId: runtime.jobId,
    });

    const normalized = normalizeProgressPayload(raw);

    patchRuntime(normalized);
    broadcastAll();

    if (normalized.errorMessage) {
      stopPolling();
      return;
    }

    if (normalized.done) {
      stopPolling();
      return;
    }

    scheduleNextPoll(1500);
  } catch (error) {
    if (error?.code === 401) {
      stopPolling();
      currentToken = null;
      resetRuntime();
      broadcastUnauthorized();
      return;
    }

    patchRuntime({
      isRunning: false,
      done: false,
      errorMessage: error?.message || "Không thể lấy tiến độ job",
    });
    broadcastAll();
    stopPolling();
  }
}

function isValidToidispyUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes("toidispy.com");
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  if (!tabs || !tabs.length) {
    return null;
  }

  return tabs[0];
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message?.type) {
    return false;
  }

  if (message.type === "GET_POPUP_STATE") {
    sendResponse({
      success: true,
      runtime: getRuntimeSnapshot(),
    });
    return true;
  }

  if (message.type === "RESET_CRAWL_STATE") {
    stopPolling();
    currentToken = null;
    resetRuntime();
    broadcastRuntimeUpdate();

    sendResponse({ success: true });
    return true;
  }

  if (message.type === "START_CRAWL") {
    (async () => {
      try {
        const token = message.token;
        const payload = message.payload || {};
        const rawCount = payload.count;
        const isAll = rawCount === null || rawCount === undefined;
        const count = isAll ? null : Number(rawCount);
        const urlFromPopup = payload.url || "";

        if (!token) {
          sendResponse({
            success: false,
            code: 401,
            error: "Thiếu token",
          });
          return;
        }

        if (!isAll && (!Number.isInteger(count) || count <= 0)) {
          sendResponse({
            success: false,
            error: "Số lượng sản phẩm không hợp lệ",
          });
          return;
        }

        const activeTab = await getActiveTab();

        if (!activeTab?.url) {
          sendResponse({
            success: false,
            error: "Không tìm thấy tab hiện tại",
          });
          return;
        }

        if (!isValidToidispyUrl(activeTab.url)) {
          sendResponse({
            success: false,
            error: "Vui lòng mở tab toidispy.com trước khi crawl",
          });
          return;
        }

        currentToken = token;
        stopPolling();

        patchRuntime({
          ...DEFAULT_RUNTIME,
          activeTabUrl: urlFromPopup || activeTab.url,
          targetCount: count ?? 0,
          isRunning: true,
          done: false,
          errorMessage: "",
        });

        broadcastRuntimeUpdate();

        const result = await startCrawlJob({
          token,
          url: urlFromPopup || activeTab.url,
          count,
        });

        const jobId = result?.jobId || result?.data?.jobId || "";
        const targetCount =
          Number(result?.targetCount || 0) ||
          Number(result?.data?.targetCount || 0) ||
          Number(count || 0);

        if (!jobId) {
          throw new Error("Backend không trả về jobId");
        }

        patchRuntime({
          jobId,
          targetCount,
          crawledCount: 0,
          uploadedCount: 0,
          uploadTotal: 0,
          queuedProducts: 0,
          estimatedMinutes: 0,
          done: false,
          errorMessage: "",
          isRunning: true,
          activeTabUrl: urlFromPopup || activeTab.url,
        });

        broadcastAll();
        scheduleNextPoll(300);

        sendResponse({
          success: true,
          jobId,
          runtime: getRuntimeSnapshot(),
        });
      } catch (error) {
        const messageText =
          error instanceof Error ? error.message : "Lỗi không xác định";

        const code =
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === 401
            ? 401
            : 500;

        if (code === 401) {
          stopPolling();
          currentToken = null;
          resetRuntime();
          broadcastUnauthorized();

          sendResponse({
            success: false,
            code: 401,
            error: "Phiên đăng nhập đã hết hạn",
          });
          return;
        }

        patchRuntime({
          isRunning: false,
          done: false,
          errorMessage: messageText,
        });

        broadcastAll();

        sendResponse({
          success: false,
          code,
          error: messageText,
        });
      }
    })();
    return true;
  }
  return false;
});