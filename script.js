const storageKey = "greenhouse-management-v2";
const fileDbName = "greenhouse-management-files";
const fileStoreName = "sensor-files";

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
    8: ["0408 溫室資料分析"],
    17: ["0417 感測測試紀錄"],
    18: ["0418 合併資料檢核"],
    21: ["感測測試資料檢核"],
    23: ["0423 作業資料歸檔"],
    25: ["系統日誌整理"],
    28: ["灌溉策略檢討"]
  }
};

let state = migrateState(loadState());

const dailyLogForm = document.querySelector("#dailyLogForm");
const dataFileForm = document.querySelector("#dataFileForm");
const systemLogForm = document.querySelector("#systemLogForm");
const dailyDate = document.querySelector("#dailyDate");
const dataFileDate = document.querySelector("#dataFileDate");
const systemTime = document.querySelector("#systemTime");

dailyDate.value = "2026-04-25";
dataFileDate.value = "2026-04-25";
systemTime.value = "2026-04-25T09:30";

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaultState);
  try {
    return JSON.parse(saved);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
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
  const sorted = [...state.dailyLogs].sort((a, b) => b.date.localeCompare(a.date));
  list.innerHTML = sorted.map((log) => `
    <article class="feed-item">
      <div class="item-top">
        <strong>${escapeHtml(log.date)} ${escapeHtml(log.type)}</strong>
        <span class="tag">${escapeHtml(log.status)}</span>
      </div>
      <p>${escapeHtml(log.note)}</p>
      <small>負責人：${escapeHtml(log.owner || "未指定")}</small>
    </article>
  `).join("");
  document.querySelector("#dailyLogCount").textContent = `${state.dailyLogs.length} 筆`;
}

function renderSystemLogs() {
  const list = document.querySelector("#systemLogList");
  const sorted = [...state.systemLogs].sort((a, b) => b.time.localeCompare(a.time));
  list.innerHTML = sorted.map((log) => `
    <article class="timeline-item">
      <div class="item-top">
        <strong>${formatDateTime(log.time)}</strong>
        <span class="tag level-${escapeHtml(log.level)}">${escapeHtml(log.level)}</span>
      </div>
      <p>${escapeHtml(log.message)}</p>
    </article>
  `).join("");
  document.querySelector("#systemLogCount").textContent = `${state.systemLogs.length} 筆`;
}

function renderTasks() {
  const list = document.querySelector("#todayTasks");
  list.innerHTML = state.tasks.map((task) => `
    <label class="todo-item ${task.done ? "done" : ""}">
      <input type="checkbox" data-task-id="${task.id}" ${task.done ? "checked" : ""}>
      <span>${escapeHtml(task.text)}</span>
    </label>
  `).join("");
  const remaining = state.tasks.filter((task) => !task.done).length;
  document.querySelector("#todayTaskCount").textContent = `${remaining} 項待處理`;
}

function renderOverview() {
  const remaining = state.tasks.filter((task) => !task.done).length;
  const averageProgress = Math.round(
    state.progress.reduce((total, item) => total + item.value, 0) / state.progress.length
  );
  document.querySelector("#metricTasks").textContent = remaining;
  document.querySelector("#metricDailyLogs").textContent = state.dailyLogs.length;
  document.querySelector("#metricSystemLogs").textContent = state.systemLogs.length;
  document.querySelector("#metricProgress").textContent = `${averageProgress}%`;
  document.querySelector(".metric-ring").style.setProperty("--progress", `${averageProgress}%`);

  const recentDaily = [...state.dailyLogs]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  document.querySelector("#recentDailyLogs").innerHTML = recentDaily.map((log, index) => `
    <article class="summary-item ${index === 0 ? "accent" : ""}">
      <strong>${escapeHtml(log.date)} ${escapeHtml(log.type)}</strong>
      <span>${escapeHtml(log.note)}</span>
      <small>負責人：${escapeHtml(log.owner || "未指定")} · ${escapeHtml(log.status)}</small>
    </article>
  `).join("");

  const upcomingEvents = Object.entries(state.calendarEvents)
    .flatMap(([day, events]) => events.map((event) => ({ day: Number(day), event })))
    .filter((item) => item.day >= 25)
    .slice(0, 4);
  document.querySelector("#upcomingEvents").innerHTML = upcomingEvents.map((item) => `
    <article class="summary-item">
      <strong>4/${item.day}</strong>
      <span>${escapeHtml(item.event)}</span>
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
  const weekdays = ["日", "一", "二", "三", "四", "五", "六"];
  const headers = weekdays.map((day) => `<div class="calendar-weekday">週${day}</div>`);
  const blanks = Array.from({ length: 3 }, () => `<div class="calendar-day calendar-empty" aria-hidden="true"></div>`);
  const days = Array.from({ length: 30 }, (_, index) => {
    const day = index + 1;
    const events = ["巡檢", ...(state.calendarEvents[day] || [])];
    return `
      <div class="calendar-day">
        <strong>4/${day}</strong>
        ${events.map((event) => `<span class="event">${escapeHtml(event)}</span>`).join("")}
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
      <input type="range" min="0" max="100" value="${item.value}" data-progress-index="${index}" aria-label="${escapeHtml(item.name)}完成度">
    </article>
  `).join("");
}

function renderAll() {
  renderDailyLogs();
  renderSystemLogs();
  renderTasks();
  renderOverview();
  renderCalendar();
  renderProgress();
  renderDataFiles();
}

dailyLogForm.addEventListener("submit", (event) => {
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
    await saveDataFile({
      id: createFileId(),
      date: dataFileDate.value,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      note: document.querySelector("#dataFileNote").value.trim(),
      createdAt: new Date().toISOString(),
      file
    });
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
    await downloadDataFile(id);
  }

  if (button.dataset.fileAction === "delete") {
    if (!confirm("確定要刪除此檔案？")) return;
    await deleteDataFile(id);
    await renderDataFiles();
  }
});

systemLogForm.addEventListener("submit", (event) => {
  event.preventDefault();
  state.systemLogs.unshift({
    time: systemTime.value,
    level: document.querySelector("#systemLevel").value,
    message: document.querySelector("#systemMessage").value.trim() || "未填寫事件內容"
  });
  saveState();
  systemLogForm.reset();
  systemTime.value = "2026-04-25T09:30";
  renderAll();
});

document.addEventListener("change", (event) => {
  const taskId = event.target.dataset.taskId;
  if (taskId) {
    const task = state.tasks.find((item) => item.id === Number(taskId));
    task.done = event.target.checked;
    saveState();
    renderAll();
  }
});

document.addEventListener("input", (event) => {
  const progressIndex = event.target.dataset.progressIndex;
  if (progressIndex !== undefined) {
    state.progress[Number(progressIndex)].value = Number(event.target.value);
    saveState();
    renderAll();
  }
});

document.querySelector("#resetBtn").addEventListener("click", () => {
  state = structuredClone(defaultState);
  saveState();
  renderAll();
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
    const imported = JSON.parse(await file.text());
    validateImportedState(imported);
    state = imported;
    saveState();
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

function formatDateTime(value) {
  return value.replace("T", " ");
}

function validateImportedState(imported) {
  const requiredArrays = ["dailyLogs", "systemLogs", "tasks", "progress"];
  const hasArrays = requiredArrays.every((key) => Array.isArray(imported[key]));
  const hasCalendar = imported.calendarEvents && typeof imported.calendarEvents === "object";
  if (!hasArrays || !hasCalendar) {
    throw new Error("檔案格式不符合管理網站備份資料。");
  }
}

function openFileDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(fileDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(fileStoreName)) {
        const store = db.createObjectStore(fileStoreName, { keyPath: "id" });
        store.createIndex("date", "date");
        store.createIndex("createdAt", "createdAt");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveDataFile(record) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(fileStoreName, "readwrite");
    transaction.objectStore(fileStoreName).put(record);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function getDataFiles() {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(fileStoreName, "readonly").objectStore(fileStoreName).getAll();
    request.onsuccess = () => {
      db.close();
      resolve(request.result.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)));
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function getDataFile(id) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(fileStoreName, "readonly").objectStore(fileStoreName).get(id);
    request.onsuccess = () => {
      db.close();
      resolve(request.result);
    };
    request.onerror = () => {
      db.close();
      reject(request.error);
    };
  });
}

async function deleteDataFile(id) {
  const db = await openFileDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(fileStoreName, "readwrite");
    transaction.objectStore(fileStoreName).delete(id);
    transaction.oncomplete = () => {
      db.close();
      resolve();
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

async function downloadDataFile(id) {
  const record = await getDataFile(id);
  if (!record) return;
  const url = URL.createObjectURL(record.file);
  const link = document.createElement("a");
  link.href = url;
  link.download = record.name;
  link.click();
  URL.revokeObjectURL(url);
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

function formatFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function createFileId() {
  const randomId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(16).slice(2);
  return `${Date.now()}-${randomId}`;
}

function getPageFromHash() {
  const hash = window.location.hash.replace("#", "");
  return document.querySelector(`[data-page="${hash}"]`) ? hash : "overview";
}

function showPage(pageId, updateHash) {
  document.querySelectorAll(".page").forEach((page) => {
    page.classList.toggle("active-page", page.dataset.page === pageId);
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

renderAll();
showPage(getPageFromHash(), false);
