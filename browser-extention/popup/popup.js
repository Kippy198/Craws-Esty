document.addEventListener("DOMContentLoaded", () => {
  const AUTH_TOKEN_KEY = "Token";
  const USERNAME_KEY = "Username";
  const MAX = 999;
  const LOGIN_API =
    "https://fthzm2m3h3.execute-api.ap-southeast-1.amazonaws.com/users/auth";

  const UI_STATES = {
    UNAUTHENTICATED: "unauthenticated",
    READY: "ready",
    RUNNING: "running",
    DONE: "done",
  };

  const loginView = document.getElementById("login-view");
  const appView = document.getElementById("app-view");

  const loginForm = document.getElementById("login-form");
  const usernameInput = document.getElementById("username");
  const passwordInput = document.getElementById("password");
  const loginButton = document.getElementById("login-button");
  const loginStatus = document.getElementById("login-status");

  const readyView = document.getElementById("ready-view");
  const runningView = document.getElementById("running-view");
  const doneView = document.getElementById("done-view");

  const countInput = document.getElementById("craw-countThumb");
  const crawlButton = document.getElementById("craw-button");
  const readyHelper = document.getElementById("ready-helper");

  const progressFill = document.getElementById("progress-fill");
  const runningMainText = document.getElementById("running-main-text");
  const runningSubText = document.getElementById("running-sub-text");

  const doneQueueText = document.getElementById("done-queue-text");
  const doneEstimateText = document.getElementById("done-estimate-text");
  const restartButton = document.getElementById("restart-button");
  const logoutButton = document.getElementById("logout-button");

  const accountUsername = document.getElementById("account-username");

  let popupState = UI_STATES.UNAUTHENTICATED;
  let currentRuntime = {
    jobId:"",
    targetCount: 0,
    crawledCount: 0,
    uploadedCount: 0,
    uploadTotal: 0,
    queuedProducts: 0,
    estimatedMinutes: 0,
    done: false,
    errorMessage: "",
    activeTabUrl: "",
    onValidDomain: false,
  };

  function showElement(el) {
    el.classList.remove("hidden");
  }

  function hideElement(el) {
    el.classList.add("hidden");
  }

  function setLoginStatus(message = "") {
    loginStatus.textContent = message;
  }

  function setBadge(text, colorClass) {
    stateBadge.textContent = text;
    stateBadge.className = `badge ${colorClass}`;
  }

  async function renderAccountInfo() {
    if(!accountUsername) return;

    const username = await getUserName();
    accountUsername.textContent = username || "-";
  }

  function getToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get([AUTH_TOKEN_KEY], (result) => {
        resolve(result[AUTH_TOKEN_KEY] || null);
      });
    });
  }

  function getUserName() {
    return new Promise((resolve) => {
      chrome.storage.local.get([USERNAME_KEY], (result) => {
        resolve(result[USERNAME_KEY] || "");
      });
    });
  }

  function saveToken(token) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [AUTH_TOKEN_KEY]: token }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  function saveUserName(username) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set({ [USERNAME_KEY]: username }, () => {
        if(chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  function clearToken() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([AUTH_TOKEN_KEY], () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      });
    });
  }

  function clearUserName() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.remove([USERNAME_KEY], () => {
        if(chrome.runtime.lastError){
          reject(chrome.runtime.lastError);
          return;
        }
        resolve();
      })
    })
  }

  function sendMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  function parseJwt(token) {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(payload));
    } catch {
      return null;
    }
  }

  function isTokenExpired(token) {
    const payload = parseJwt(token);
    if (!payload || !payload.exp) return true;
    const now = Math.floor(Date.now() / 1000);
    return payload.exp <= now;
  }

  async function fetchLogin(username, password) {
    const res = await fetch(LOGIN_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username,
        password,
      }),
    });

    const raw = await res.text();
    let data = null;

    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = raw;
    }

    if (!res.ok) {
      throw new Error(data?.error_message || "Đăng nhập thất bại");
    }

    const token = data?.data;
    if (!token) {
      throw new Error("Server không trả về accesstoken");
    }

    return token;
  }

  function computeProgressPercent(runtime) {
    const target = Number(runtime.targetCount || 0);
    const crawled = Number(runtime.crawledCount || 0);
    const uploadTotal = Number(runtime.uploadTotal || 0);
    const uploaded = Number(runtime.uploadedCount || 0);

    if (target <= 0 && uploadTotal <= 0) return 0;

    const crawlWeight = 0.6;
    const uploadWeight = 0.4;

    const crawlRatio = target > 0 ? Math.min(crawled / target, 1) : 0;
    const uploadRatio = uploadTotal > 0 ? Math.min(uploaded / uploadTotal, 1) : 0;

    const total = crawlRatio * crawlWeight + uploadRatio * uploadWeight;
    return Math.max(0, Math.min(100, Math.round(total * 100)));
  }

  function hasRunningProgress(runtime) {
    return (
      Number(runtime.crawledCount || 0) > 0 ||
      Number(runtime.uploadedCount || 0) > 0 ||
      Number(runtime.targetCount || 0) > 0 || 
      Number(runtime.uploadTotal || 0) > 0
    )
  }

  function applyRuntimePatch(patch = {}) {
    currentRuntime = {
      ...currentRuntime,
      ...patch,
    };
  }

  function resetRuntimeProgress() {
    currentRuntime = {
      ...currentRuntime,
      jobId: "",
      targetCount: 0,
      crawledCount: 0,
      uploadedCount: 0,
      uploadTotal: 0,
      queuedProducts: 0,
      estimatedMinutes: 0,
      done: false,
      errorMessage: "",
    };
  }

  function renderReadyState() {
    popupState = UI_STATES.READY;

    showElement(appView);
    hideElement(loginView);

    showElement(readyView);
    hideElement(runningView);
    hideElement(doneView);

    setBadge("Sẵn sàng", "blue");
    stateSubtitle.textContent = "Hãy mở Toidispy.com trước khi bắt đầu crawl";

    renderAccountInfo();

    const rawCount = countInput.value.trim();
    const parsedCount = Number(rawCount);
    const isEmptyCount = rawCount === "";
    const isValidCount =
      isEmptyCount || 
      (Number.isInteger(parsedCount) && parsedCount > 0 && parsedCount <= MAX);

    const onValidDomain = !!currentRuntime.onValidDomain;

    let disabledReason = "";
    if (!onValidDomain) {
      disabledReason = "Nút chỉ hoạt động khi tab hiện tại đang ở toidispy.com";
    } else if ( !isValidCount) {
      disabledReason = `Vui lòng nhập số lượng sản phẩm hợp lệ (1 - ${MAX} hoặc để trống`;
    }

    crawlButton.disabled = !!disabledReason;
    crawlButton.title = disabledReason;

    if(currentRuntime.errorMessage) {
      readyHelper.textContent = `${currentRuntime.errorMessage}`;
    } else {
      readyHelper.textContent = 
        disabledReason || 
        (
          isEmptyCount
            ? "Nếu để trống => Crawl Toàn Bộ Sản Phẩm"
            : "Bắt đầu crawl"
        );
      }
    }

  function renderRunningState() {
    popupState = UI_STATES.RUNNING;

    showElement(appView);
    hideElement(loginView);

    hideElement(readyView);
    showElement(runningView);
    hideElement(doneView);

    setBadge("Đang crawl", "orange");
    stateSubtitle.textContent = "Vui lòng giữ tab Toidispy mở trong lúc crawl";

    renderAccountInfo();

    const percent = computeProgressPercent(currentRuntime);
    progressFill.style.width = `${percent}%`;

    runningMainText.textContent =
      `Đã crawl ${currentRuntime.crawledCount || 0}/${currentRuntime.targetCount || 0} sản phẩm`;

    const uploaded = Number(currentRuntime.uploadedCount || 0);
    const uploadTotal = Number(currentRuntime.uploadTotal || 0);

    if (uploadTotal > 0) {
      runningSubText.textContent =`Đang upload ảnh ${uploaded}/${uploadTotal}`;
    } else {
      runningSubText.textContent = "Đang chuẩn bị upload...";
    }
  }

  function renderDoneState() {
    popupState = UI_STATES.DONE;

    showElement(appView);
    hideElement(loginView);

    hideElement(readyView);
    hideElement(runningView);
    showElement(doneView);

    setBadge("Đã gửi xong", "green");
    stateSubtitle.textContent = "Batch đã được đưa vào hàng đợi xử lý";

    renderAccountInfo();
    doneQueueText.textContent =
      `${currentRuntime.queuedProducts || 0} sản phẩm đã vào hàng đợi`;

    doneEstimateText.textContent =
      `Ước tính xử lý khoảng ~${currentRuntime.estimatedMinutes || 0} phút`;
  }

  function renderUnauthenticatedState() {
    popupState = UI_STATES.UNAUTHENTICATED;
    showElement(loginView);
    hideElement(appView);
  }

  function render() {
    if (popupState === UI_STATES.UNAUTHENTICATED) {
      renderUnauthenticatedState();
      return;
    }

    if (hasRunningProgress(currentRuntime)) {
      renderRunningState();
      return;
    }

    if (currentRuntime.status === "done") {
      renderDoneState();
      return;
    }

    renderReadyState();
  }

  async function getCurrentTabDomainState() {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tabs?.length) {
        return {
          onValidDomain: false,
          activeTabUrl: "",
        };
      }

      const tab = tabs[0];
      let parsed = null;

      try {
        parsed = new URL(tab.url);
      } catch {
        return {
          onValidDomain: false,
          activeTabUrl: tab.url || "",
        };
      }

      return {
        onValidDomain: parsed.hostname.includes("toidispy.com"),
        activeTabUrl: tab.url || "",
      };
    } catch {
      return {
        onValidDomain: false,
        activeTabUrl: "",
      };
    }
  }

  async function syncPopupStateFromBackground() {
    const tabState = await getCurrentTabDomainState();
    const bgState = await sendMessage("GET_POPUP_STATE");

    applyRuntimePatch({
      ...tabState,
      ...(bgState?.runtime || {}),
    });

    render();
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!username || !password) {
      setLoginStatus("Vui lòng nhập đầy đủ tài khoản và mật khẩu");
      return;
    }

    loginButton.disabled = true;
    setLoginStatus("Đang đăng nhập...");

    try {
      const token = await fetchLogin(username, password);
      await saveToken(token);
      await saveUserName(username);

      passwordInput.value = "";
      setLoginStatus("");

      popupState = UI_STATES.READY;
      await syncPopupStateFromBackground();
    } catch (error) {
      setLoginStatus(error.message || "Đăng nhập thất bại");
    } finally {
      loginButton.disabled = false;
    }
  });

  countInput.addEventListener("input", () => {
    if (popupState === UI_STATES.READY) {
      renderReadyState();
    }
  });

  async function refreshActiveTabState() {
    const tabState = await getCurrentTabDomainState();
    applyRuntimePatch(tabState);
    render();
  }

  chrome.tabs.onActivated.addListener(() => {
    refreshActiveTabState().catch(console.error);
  });

  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" || changeInfo.url) {
      refreshActiveTabState().catch(console.error);
    }
  });

  window.addEventListener("focus", () => {
    refreshActiveTabState().catch(console.error);
  });

  crawlButton.addEventListener("click", async () => {
    const rawCount = countInput.value.trim();
    const isEmptyCount = rawCount === "";
    const count = isEmptyCount ? null : Number(rawCount)

    if (!isEmptyCount && (!Number.isInteger(count) || count <= 0 || count > MAX)) {
      renderReadyState();
      return;
    }

    const token = await getToken();
    if (!token || isTokenExpired(token)) {
      await clearToken();
      await clearUserName();
      renderUnauthenticatedState();
      setLoginStatus("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
      return;
    }

    try {
      const tabState = await getCurrentTabDomainState();
      applyRuntimePatch(tabState);

      if (!currentRuntime.onValidDomain) {
        renderReadyState();
        return;
      }

      const response = await sendMessage("START_CRAWL", {
        payload: {
          url: currentRuntime.activeTabUrl,
          count,
        },
        token,
      });

      if (!response?.success) {
        if (response?.code === 401) {
          await clearToken();
          await clearUserName();
          renderUnauthenticatedState();
          setLoginStatus("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
          return;
        }
        currentRuntime.errorMessage = response?.error || "Không thể bắt đầu crawl";
        renderReadyState();
        return;
      }

      applyRuntimePatch({
        jobId: response?.runtime?.jobId || response?.jobId || "",
        targetCount: count ?? 0,
        crawledCount: 0,
        uploadedCount: 0,
        uploadTotal: 0,
        queuedProducts: 0,
        estimatedMinutes: 0,
        done: false,
        errorMessage: "",
      });

      render();
    } catch (error) {
      readyHelper.textContent = error.message || "Không thể bắt đầu crawl";
      renderReadyState();
    }
  });

  restartButton.addEventListener("click", async () => {
    try {
      await sendMessage("RESET_CRAWL_STATE");
      resetRuntimeProgress();
      renderReadyState();
    } catch (error) {
      console.error(error);
    }
  });

  logoutButton.addEventListener("click", async () => {
    await clearToken();
    await clearUserName();
    resetRuntimeProgress();
    renderUnauthenticatedState();
    setLoginStatus("");
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message?.type) return;

    switch (message.type) {

      case "RUNTIME_UPDATE" :
        applyRuntimePatch(message.runtime || {});
        render();
        break;

      case "PRODUCT_PROGRESS":
        applyRuntimePatch({
          crawledCount: message.total || 0,
          targetCount: message.target || currentRuntime.targetCount || 0,
          done: false,
          errorMessage: "",
        })
        render();
        break;

      case "UPLOAD_PROGRESS":
        applyRuntimePatch({
          uploadedCount: message.current || 0,
          uploadTotal: message.total || 0,
          done: false,
          errorMessage: "",
        });
        render();
        break;

      case "CRAWL_FINISHED":
        applyRuntimePatch({
          done: true,
          queuedProducts: message.queuedProducts || 0,
          estimatedMinutes: message.estimatedMinutes || 0,
          errorMessage: "",
        });
        render();
        break;

      case "CRAWL_ERROR":
        applyRuntimePatch({
          done: false,
          errorMessage: message.error || "Unknown Error",
        });
        renderReadyState();
        break;

      case "UNAUTHORIZED":
        Promise.all([clearToken(), clearUserName()]).finally(() => {
          resetRuntimeProgress();
          renderUnauthenticatedState();
          setLoginStatus("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại");
        });
        break;
    }
  });

  async function bootstrap() {
    const token = await getToken();

    if (!token) {
      renderUnauthenticatedState();
      return;
    }

    if (isTokenExpired(token)) {
      await clearToken();
      await clearUserName();
      renderUnauthenticatedState();
      return;
    }

    popupState = UI_STATES.READY;
    await syncPopupStateFromBackground();
  }
  bootstrap();
});