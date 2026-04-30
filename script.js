const storageKey = "greenhouse-management-v2";
const apiBase = window.location.protocol === "file:" ? "http://127.0.0.1:8088/api" : "api";

const defaultState = {
  dailyLogs: [
    {
      date: "2026-04-25",
      type: "巡檢",
      owner: "溫室管理員",
      status: "觀察中",
      note: "上午確認單一溫室感測測試狀態，資料記錄正常，待下午再次檢查。"
    },
    {
      date: "2026-04-24",
      type: "灌溉",
      owner: "王同學",
      status: "已完成",
      note: "完成溫室灌溉作業登錄，已補上照片與負責人簽核。"
    }
  ],
  systemLogs: [
    {
      time: "2026-04-25T09:12",
      level: "警告",
      message: "感測測試資料匯出尚未確認，已標記給管理者追蹤。"
    },
    {
      time: "2026-04-25T07:40",
      level: "資訊",
      message: "管理網站部署完成，表單資料已可匯出備份。"
    },
    {
      time: "2026-04-24T16:30",
      level: "注意",
      message: "本週灌溉排程尚有 1 筆待管理者確認。"
    }
  ],
  tasks: [
    { id: 1, text: "確認今日感測測試資料", done: false },
    { id: 2, text: "補登 0424 測試紀錄", done: false },
    { id: 3, text: "確認本週巡檢人員分工", done: true }
  ],
  progress: [
    { name: "本機資料備份流程", value: 82 },
    { name: "感測測試資料整理", value: 68 },
    { name: "每日管理流程數位化", value: 45 },
    { name: "實驗室電腦搬移準備", value: 56 }
  ],
  calendarEvents: {
    "2026-04-08": [{ title: "0408 溫室資料分析", type: "排程", note: "" }],
    "2026-04-17": [{ title: "0417 感測測試紀錄", type: "排程", note: "" }],
    "2026-04-18": [{ title: "0418 合併資料檢核", type: "排程", note: "" }],
    "2026-04-21": [{ title: "感測測試資料檢核", type: "提醒", note: "" }],
    "2026-04-23": [{ title: "0423 作業資料歸檔", type: "排程", note: "" }],
    "2026-04-25": [{ title: "系統日誌整理", type: "提醒", note: "" }],
    "2026-04-28": [{ title: "灌溉策略檢討", type: "會議", note: "" }]
  }
};

let state = migrateState(loadState());

const dailyLogForm = document.querySelector("#dailyLogForm");
const systemLogForm = document.querySelector("#systemLogForm");
const dailyDate = document.querySelector("#dailyDate");
const systemTime = document.querySelector("#systemTime");
const dataFileDate = document.querySelector("#dataFileDate");
const calendarEventDate = document.querySelector("#calendarEventDate");
const weatherSummary = document.querySelector("#weatherAlertSummary");
const refreshWeatherBtn = document.querySelector("#refreshWeatherBtn");
const prevMonthBtn = document.querySelector("#prevMonthBtn");
const nextMonthBtn = document.querySelector("#nextMonthBtn");

async function initApp() {
  setDefaultFormValues();
  state = await loadAppState();
  renderAll();
  await Promise.all([renderWeatherAlerts(), renderDataFiles()]);
  showPage(getPageFromHash(), false);
  weatherRefreshTimer = window.setInterval(() => {
    renderWeatherAlerts(true);
  }, 5 * 60 * 1000);
}

function setDefaultFormValues() {
  dailyDate.value = "2026-04-25";
  dataFileDate.value = "2026-04-25";
  systemTime.value = "2026-04-25T09:30";
  calendarEventDate.value = "2026-04-25";
}

async function loadAppState() {
  try {
    const response = await fetch(apiUrl("app-state"));
    if (!response.ok) throw new Error("本機資料庫沒有回應");
    const payload = await response.json();
    return normalizeState(payload);
  } catch {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return normalizeState(defaultState);
    try {
      return normalizeState(JSON.parse(saved));
    } catch {
      return normalizeState(defaultState);
    }
  }
}

async function persistState() {
  state = normalizeState(state);
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function migrateState(currentState) {
  currentState.progress = currentState.progress.map((item) => {
    if (item.name === "管理日誌雲端同步") {
      return { ...item, name: "本機資料備份流程" };
    }
    if (item.name === "管理者權限與登入設定") {
      return { ...item, name: "實驗室電腦搬移準備" };
    }
    return item;
  });
  Object.keys(currentState.calendarEvents).forEach((day) => {
    currentState.calendarEvents[day] = currentState.calendarEvents[day].filter((event) => event !== "例行巡檢");
  });
  saveMigratedState(currentState);
  return currentState;
}

function saveMigratedState(currentState) {
  localStorage.setItem(storageKey, JSON.stringify(currentState));
}

function renderDailyLogs() {
  const list = document.querySelector("#dailyLogList");
  const pagination = document.querySelector("#dailyLogPagination");
  const sorted = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
  const pageSize = dailyLogExpandedView ? dailyLogExpandedCount : dailyLogPreviewCount;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  dailyLogPage = Math.min(dailyLogPage, pageCount - 1);
  const visibleLogs = sorted.slice(dailyLogPage * pageSize, dailyLogPage * pageSize + pageSize);

  list.innerHTML = visibleLogs.map((log) => `
    <article class="feed-item">
      <div class="item-top">
        <strong>${escapeHtml(log.date)} ${escapeHtml(log.type)}</strong>
        <span class="tag">${escapeHtml(log.status)}</span>
      </div>
      <p class="feed-note expanded">${escapeHtml(log.note)}</p>
      <small>負責人：${escapeHtml(log.owner || "未指定")}</small>
    </article>
  `).join("");
  document.querySelector("#dailyLogCount").textContent = `顯示 ${visibleLogs.length} / 共 ${sorted.length} 筆`;
  pagination.innerHTML = `
    <button class="icon-button compact-button" type="button" data-daily-page-action="toggle">
      ${dailyLogExpandedView ? "收合" : "開啟更多"}
    </button>
    ${dailyLogExpandedView ? `
      <button class="icon-button compact-button" type="button" data-daily-page-action="prev" ${dailyLogPage === 0 ? "disabled" : ""}>上一頁</button>
      <span class="feed-page-indicator">第 ${dailyLogPage + 1} / ${pageCount} 頁</span>
      <button class="icon-button compact-button" type="button" data-daily-page-action="next" ${dailyLogPage >= pageCount - 1 ? "disabled" : ""}>下一頁</button>
    ` : ""}
  `;
}

function renderSystemLogs() {
  const list = document.querySelector("#systemLogList");
  const pagination = document.querySelector("#systemLogPagination");
  const sorted = [...state.systemLogs].sort((a, b) => b.time.localeCompare(a.time));
  const pageSize = systemLogExpandedView ? systemLogExpandedCount : systemLogPreviewCount;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  systemLogPage = Math.min(systemLogPage, pageCount - 1);
  const visibleLogs = sorted.slice(systemLogPage * pageSize, systemLogPage * pageSize + pageSize);

  list.innerHTML = visibleLogs.map((log) => `
    <article class="timeline-item">
      <div class="item-top">
        <strong>${formatDateTime(log.time)}</strong>
        <span class="tag level-${escapeHtml(log.level)}">${escapeHtml(log.level)}</span>
      </div>
      <p>${escapeHtml(log.message)}</p>
    </article>
  `).join("");
  document.querySelector("#systemLogCount").textContent = `顯示 ${visibleLogs.length} / 共 ${sorted.length} 筆`;
  pagination.innerHTML = `
    <button class="icon-button compact-button" type="button" data-system-page-action="toggle">
      ${systemLogExpandedView ? "收合" : "開啟更多"}
    </button>
    ${systemLogExpandedView ? `
      <button class="icon-button compact-button" type="button" data-system-page-action="prev" ${systemLogPage === 0 ? "disabled" : ""}>上一頁</button>
      <span class="feed-page-indicator">第 ${systemLogPage + 1} / ${pageCount} 頁</span>
      <button class="icon-button compact-button" type="button" data-system-page-action="next" ${systemLogPage >= pageCount - 1 ? "disabled" : ""}>下一頁</button>
    ` : ""}
  `;
}

function renderTasks() {
  const list = document.querySelector("#todayTasks");
  const tasks = getTodayTaskItems();
  list.innerHTML = tasks.map((task) => `
    <article class="todo-item ${task.done ? "done" : ""} ${task.source === "calendar" ? "linked" : ""}">
      <label class="todo-check">
        <input
          type="checkbox"
          ${task.source === "calendar"
            ? `data-calendar-task-key="${escapeHtml(task.calendarKey)}" data-calendar-task-date="${escapeHtml(task.date)}" data-calendar-task-type="${escapeHtml(task.calendarType)}" data-calendar-task-title="${escapeHtml(task.text)}"`
            : `data-task-id="${task.id}"`}
          ${task.done ? "checked" : ""}
        >
        <span>${escapeHtml(task.text)}</span>
      </label>
      <div class="todo-tools">
        ${task.source === "calendar"
          ? `<span class="tag todo-tag">${escapeHtml(task.calendarType || "行事曆")}</span>`
          : `<span class="tag todo-tag">手動</span><button class="danger-button compact-button" type="button" data-task-action="delete" data-task-id="${task.id}">刪除</button>`}
      </div>
    </article>
  `).join("");
  const remaining = tasks.filter((task) => !task.done).length;
  document.querySelector("#todayTaskCount").textContent = `${remaining} 項待處理`;
}

function renderOverview() {
  const remaining = getTodayTaskItems().filter((task) => !task.done).length;
  const averageProgress = Math.round(
    state.progress.reduce((total, item) => total + item.value, 0) / state.progress.length
  );
  document.querySelector("#metricTasks").textContent = remaining;
  document.querySelector("#metricDailyLogs").textContent = state.dailyLogs.length;
  document.querySelector("#metricSystemLogs").textContent = state.systemLogs.length;
  document.querySelector("#metricProgress").textContent = `${averageProgress}%`;
  document.querySelector(".metric-ring").style.setProperty("--progress", `${averageProgress}%`);

  document.querySelector("#recentDailyLogs").innerHTML = [...state.dailyLogs]
    .slice(0, 3)
    .map((log, index) => `
      <article class="summary-item ${index === 0 ? "accent" : ""}">
        <strong>${escapeHtml(log.date)} ${escapeHtml(log.type)}</strong>
        <span>${escapeHtml(log.note)}</span>
        <small>負責人：${escapeHtml(log.owner || "未指定")} · ${escapeHtml(log.status)}</small>
      </article>
    `).join("");

  const upcomingEvents = getUpcomingCalendarEvents().slice(0, 4);
  document.querySelector("#upcomingEvents").innerHTML = upcomingEvents.map((item) => `
    <article class="summary-item">
      <strong>${escapeHtml(item.dateLabel)}</strong>
      <span>${escapeHtml(item.title)}</span>
      <small>${escapeHtml(item.type)}</small>
    </article>
  `).join("");

  const progressItems = [...state.progress]
    .sort((a, b) => a.value - b.value)
    .slice(0, 3);
  document.querySelector("#progressSnapshot").innerHTML = progressItems.map((item) => `
    <article class="summary-item">
      <strong>${escapeHtml(item.name)}</strong>
      <div class="progress-bar"><span style="width:${item.value}%"></span></div>
      <small>${item.value}% 完成</small>
    </article>
  `).join("");
}

function renderCalendar() {
  const grid = document.querySelector("#calendarGrid");
  const monthLabel = document.querySelector("#calendarMonthLabel");
  const title = document.querySelector("#calendarTitle");
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startWeekday = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  monthLabel.textContent = `${year} 年 ${month + 1} 月`;
  title.textContent = `${year} 年 ${month + 1} 月行事曆`;

  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const headers = weekdays.map((day) => `<div class="calendar-weekday">週${day}</div>`);
  const blanks = Array.from({ length: startWeekday }, () => `<div class="calendar-day calendar-empty" aria-hidden="true"></div>`);
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const isoDate = formatDateKey(year, month, day);
    const customEvents = state.calendarEvents[isoDate] || [];
    const events = [{ title: "巡檢", type: "例行" }, ...customEvents];
    return `
      <div class="calendar-day">
        <strong>${month + 1}/${day}</strong>
        ${events.map((event, eventIndex) => `
          <span class="event event-${escapeHtml(event.type)}" title="${escapeHtml(event.note || event.title)}">
            <span class="event-label">${escapeHtml(event.title)}</span>
            ${event.type === "例行" ? "" : `
              <button
                class="event-remove"
                type="button"
                aria-label="刪除 ${escapeHtml(event.title)}"
                data-calendar-action="delete"
                data-calendar-date="${escapeHtml(isoDate)}"
                data-calendar-index="${eventIndex - 1}"
              >×</button>
            `}
          </span>
        `).join("")}
      </div>
    `;
  });
  grid.innerHTML = [...headers, ...blanks, ...days].join("");
}

function renderProgress() {
  const list = document.querySelector("#progressList");
  list.innerHTML = state.progress.map((item, index) => `
    <article class="progress-item">
      <div class="progress-head">
        <strong>${escapeHtml(item.name)}</strong>
        <span>${item.value}%</span>
      </div>
      <div class="progress-bar"><span style="width:${item.value}%"></span></div>
      <div class="progress-actions">
        <button class="icon-button compact-button" type="button" data-progress-action="step" data-progress-step="-5" data-progress-index="${index}">-5</button>
        <button class="icon-button compact-button" type="button" data-progress-action="step" data-progress-step="5" data-progress-index="${index}">+5</button>
        <button class="danger-button" type="button" data-progress-action="delete" data-progress-index="${index}">刪除</button>
      </div>
      <input type="range" min="0" max="100" value="${item.value}" data-progress-index="${index}" aria-label="${escapeHtml(item.name)}完成度">
    </article>
  `).join("");
}

dailyLogForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  state.dailyLogs.unshift({
    date: dailyDate.value,
    type: document.querySelector("#dailyType").value,
    owner: document.querySelector("#dailyOwner").value.trim(),
    status: document.querySelector("#dailyStatus").value,
    note: document.querySelector("#dailyNote").value.trim() || "未填寫內容"
  });
  saveState();
  dailyLogForm.reset();
  dailyDate.value = "2026-04-25";
  renderAll();
});

dataFileForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const fileInput = document.querySelector("#dataFileInput");
  const [file] = fileInput.files;
  if (!file) return;

  try {
    const formData = new FormData();
    formData.append("date", dataFileDate.value);
    formData.append("note", document.querySelector("#dataFileNote").value.trim());
    formData.append("file", file);
    const response = await fetch(apiUrl("files"), {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || "本機資料庫沒有回應，請確認已執行「啟動本機管理網站.bat」。");
    }
    dataFileForm.reset();
    dataFileDate.value = dailyDate.value;
    await renderDataFiles();
  } catch (error) {
    alert(`檔案儲存失敗：${error.message}`);
  }
});

document.querySelector("#dataFileList").addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-file-action]");
  if (!button) return;

  const id = button.dataset.fileId;
  if (button.dataset.fileAction === "download") {
    window.location.href = apiUrl(`files/${encodeURIComponent(id)}/download`);
  }

  if (button.dataset.fileAction === "delete") {
    if (!confirm("確定要刪除此檔案？")) return;
    const response = await fetch(apiUrl(`files/${encodeURIComponent(id)}`), { method: "DELETE" });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      alert(`刪除失敗：${payload.error || "本機資料庫沒有回應。"}`);
      return;
    }
    await renderDataFiles();
  }
});

document.addEventListener("change", async (event) => {
  const taskId = event.target.dataset.taskId;
  if (taskId) {
    const task = state.tasks.find((item) => item.id === Number(taskId));
    task.done = event.target.checked;
    saveState();
    renderAll();
  } catch (error) {
    alert(`進度更新失敗：${error.message}`);
  }
});

document.addEventListener("input", async (event) => {
  const progressIndex = event.target.dataset.progressIndex;
  if (progressIndex === undefined) return;
  state.progress[Number(progressIndex)].value = clampProgressValue(Number(event.target.value));
  try {
    await persistState();
    renderAll();
  } catch (error) {
    alert(`進度更新失敗：${error.message}`);
  }
});

document.querySelector("#resetBtn").addEventListener("click", async () => {
  state = normalizeState(defaultState);
  currentMonth = new Date(2026, 3, 1);
  try {
    await persistState();
    renderAll();
  } catch (error) {
    alert(`重設失敗：${error.message}`);
  }
});

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "greenhouse-management-data.json";
  link.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#exportBtn").addEventListener("click", exportData);
document.querySelector("#exportBtnSecondary").addEventListener("click", exportData);

document.querySelector("#importInput").addEventListener("change", async (event) => {
  const [file] = event.target.files;
  if (!file) return;
  try {
    const imported = normalizeState(JSON.parse(await file.text()));
    state = imported;
    await persistState();
    renderAll();
    alert("備份資料已匯入。");
  } catch (error) {
    alert(`匯入失敗：${error.message}`);
  } finally {
    event.target.value = "";
  }
});

document.querySelectorAll(".nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showPage(link.getAttribute("href").replace("#", ""), true);
  });
});

window.addEventListener("hashchange", () => {
  showPage(getPageFromHash(), false);
});

if (refreshWeatherBtn) {
  refreshWeatherBtn.addEventListener("click", () => {
    renderWeatherAlerts(true);
  });
}

if (prevMonthBtn) {
  prevMonthBtn.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
    renderCalendar();
  });
}

if (nextMonthBtn) {
  nextMonthBtn.addEventListener("click", () => {
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
    renderCalendar();
  });
}

async function renderWeatherAlerts(forceRefresh = false) {
  const list = document.querySelector("#weatherAlertList");
  const updated = document.querySelector("#weatherAlertUpdated");
  if (!list || !updated || !weatherSummary) return;

  try {
    if (refreshWeatherBtn) {
      refreshWeatherBtn.disabled = true;
      refreshWeatherBtn.textContent = "更新中";
    }
    const response = await fetch(apiUrl(`weather-alerts${forceRefresh ? "?refresh=1" : ""}`));
    if (!response.ok) {
      throw new Error("本機氣象服務沒有回應，請確認已執行「啟動本機管理網站.bat」。");
    }
    const payload = await response.json();
      updated.textContent = `${payload.location || "鳳山區"} · ${formatDateTime((payload.updatedAt || "").slice(0, 16))}`;
      renderWeatherSummary(payload);
      renderCriticalAlert(payload);

      if (payload.status === "error") {
        list.innerHTML = "";
        list.classList.add("hidden");
        return;
      }

      if (!payload.alerts.length) {
        list.innerHTML = "";
        list.classList.add("hidden");
        return;
      }

      list.classList.remove("hidden");
      list.innerHTML = payload.alerts.map((alert) => `
        <article class="weather-alert-card ${escapeHtml(alert.severity)}">
          <span class="weather-level">${escapeHtml(alert.level)}</span>
          <strong>${escapeHtml(alert.title)}</strong>
          <p>${escapeHtml(alert.description)}</p>
        <small>${formatAlertTime(alert.startTime, alert.endTime)}</small>
      </article>
    `).join("");
  } catch (error) {
    updated.textContent = "無法更新";
    const fallbackPayload = {
      level: "連線提醒",
      headline: "氣象特報讀取失敗",
      message: error.message,
      guidance: "請確認本機管理網站已啟動，且這台電腦可連到中央氣象署開放資料平台。",
      severity: "medium"
      };
      renderWeatherSummary(fallbackPayload);
      renderCriticalAlert(fallbackPayload);
      list.innerHTML = "";
      list.classList.add("hidden");
    } finally {
      if (refreshWeatherBtn) {
        refreshWeatherBtn.disabled = false;
        refreshWeatherBtn.textContent = "更新";
      }
  }
}

function renderWeatherSummary(payload) {
  weatherSummary.innerHTML = `
    <article class="weather-summary-card ${escapeHtml(payload.severity || "clear")}">
      <span class="weather-level">${escapeHtml(payload.level || "正常")}</span>
      <strong>${escapeHtml(payload.headline || "目前無警特報")}</strong>
      <p>${escapeHtml(payload.message || "維持例行巡檢與資料登錄。")}</p>
    </article>
  `;
}

function renderCriticalAlert(payload) {
  const banner = document.querySelector("#criticalAlertBanner");
  const title = document.querySelector("#criticalAlertTitle");
  const message = document.querySelector("#criticalAlertMessage");
  if (!banner || !title || !message) return;
  const severeState = ["critical", "high"].includes(payload.severity);
  banner.classList.toggle("hidden", !severeState);
  banner.classList.toggle("critical", payload.severity === "critical");
  banner.classList.toggle("high", payload.severity === "high");
  if (!severeState) return;
  title.textContent = payload.headline || "嚴重天氣警示";
  message.textContent = payload.guidance || payload.message || "請提高管理警戒並重新安排今日作業。";
}

async function getDataFiles() {
  const response = await fetch(apiUrl("files"));
  if (!response.ok) {
    throw new Error("請使用「啟動本機管理網站.bat」開啟網站，才能讀寫本機資料庫資料夾。");
  }
  return response.json();
}

async function renderDataFiles() {
  const list = document.querySelector("#dataFileList");
  try {
    const files = await getDataFiles();
    if (!files.length) {
      list.innerHTML = `<div class="summary-item"><span>尚未匯入 Excel 或 CSV 檔案。</span></div>`;
      return;
    }
    list.innerHTML = files.map((file) => `
      <article class="file-item">
        <div>
          <strong>${escapeHtml(file.date)} ${escapeHtml(file.name)}</strong>
          <div class="file-meta">
            ${formatFileSize(file.size)} · ${escapeHtml(file.note || "無備註")} · 匯入時間 ${formatDateTime(file.createdAt.slice(0, 16))}
          </div>
        </div>
        <div class="file-actions">
          <button class="icon-button" type="button" data-file-action="download" data-file-id="${escapeHtml(file.id)}">下載</button>
          <button class="danger-button" type="button" data-file-action="delete" data-file-id="${escapeHtml(file.id)}">刪除</button>
        </div>
      </article>
    `).join("");
  } catch (error) {
    list.innerHTML = `<div class="summary-item"><span>檔案清單讀取失敗：${escapeHtml(error.message)}</span></div>`;
  }
}

function formatDateTime(value) {
  return String(value).replace("T", " ");
}

function formatAlertTime(startTime, endTime) {
  if (startTime && endTime) return `${escapeHtml(startTime)} 至 ${escapeHtml(endTime)}`;
  if (startTime) return `生效時間：${escapeHtml(startTime)}`;
  return "請留意中央氣象署最新更新。";
}

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function apiUrl(path) {
  return `${apiBase}/${path}`;
}

function getPageFromHash() {
  const hash = window.location.hash.replace("#", "");
  return document.querySelector(`[data-page="${hash}"]`) ? hash : "overview";
}

function showPage(pageId, updateHash) {
  document.querySelectorAll(".page").forEach((page) => {
    const isActive = page.dataset.page === pageId;
    page.classList.toggle("active-page", isActive);
    page.hidden = !isActive;
  });
  document.querySelectorAll(".nav a").forEach((link) => {
    link.classList.toggle("active", link.getAttribute("href") === `#${pageId}`);
  });
  if (updateHash && window.location.hash !== `#${pageId}`) {
    history.pushState(null, "", `#${pageId}`);
  }
  window.scrollTo({ top: 0, behavior: "auto" });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

initApp();
