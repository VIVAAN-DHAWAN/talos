document.addEventListener("DOMContentLoaded", () => {
  // Tabs Navigation
  const navItems = document.querySelectorAll(".nav-item");
  const tabContents = document.querySelectorAll(".tab-content");
  const pageTitle = document.getElementById("page-title");
  const pageSubtitle = document.getElementById("page-subtitle");

  const tabMeta = {
    dashboard: {
      title: "Repository Dashboard",
      subtitle: "Overview of codebase usage, dead dependencies, and active code health."
    },
    scanner: {
      title: "Dark Matter Scanner",
      subtitle: "Identify and remove unused code, exports, and dead packages."
    },
    panic: {
      title: "Panic Button Recovery",
      subtitle: "Instantly revert bad commits and open recovery pull requests."
    },
    history: {
      title: "Audit Log History",
      subtitle: "View the record of previous scans, safe cleanups, and panic reverts."
    }
  };

  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const tabName = item.getAttribute("data-tab");
      
      // Update sidebar nav items active state
      navItems.forEach(nav => nav.classList.remove("active"));
      item.classList.add("active");
      
      // Update tab content active state
      tabContents.forEach(content => content.classList.remove("active"));
      document.getElementById(`tab-${tabName}`).classList.add("active");
      
      // Update page headers
      if (tabMeta[tabName]) {
        pageTitle.textContent = tabMeta[tabName].title;
        pageSubtitle.textContent = tabMeta[tabName].subtitle;
      }

      if (tabName === "dashboard") {
        fetchDashboardStatus();
      } else if (tabName === "history") {
        fetchHistoryLogs();
      }
    });
  });

  // Health Ring Progress
  function setHealthScore(percent) {
    const ring = document.getElementById("health-ring-val");
    const label = document.getElementById("health-score");
    if (!ring || !label) return;

    // Radius is 40, circumference is 2 * pi * 40 ≈ 251.2
    const r = 40;
    const c = 2 * Math.PI * r;
    const offset = c - (percent / 100) * c;
    
    ring.style.strokeDasharray = `${c}`;
    ring.style.strokeDashoffset = `${offset}`;
    label.textContent = `${percent}%`;
  }

  // Fetch Dashboard Status
  async function fetchDashboardStatus() {
    try {
      const res = await fetch("/api/status");
      const data = await res.json();
      
      if (data.ok) {
        document.getElementById("stat-total-files").textContent = data.stats.totalFiles || "0";
        document.getElementById("stat-total-deps").textContent = data.stats.totalDeps || "0";
        document.getElementById("stat-dev-deps-count").textContent = `${data.stats.totalDevDeps || 0} devDependencies`;
        
        document.getElementById("stat-unused-files").textContent = data.unusedFiles.length || "0";
        document.getElementById("stat-unused-deps").textContent = data.unusedDeps.length || "0";
        
        // Populate config details
        document.getElementById("info-project-name").textContent = data.project.name || "Talos";
        document.getElementById("info-ts-ver").textContent = data.project.typescriptVersion || "—";

        // Calculate health index
        // Health decreases as unused dependencies and files increase
        const totalDeps = data.stats.totalDeps || 1;
        const totalFiles = data.stats.totalFiles || 1;
        const unusedDepsRatio = data.unusedDeps.length / totalDeps;
        const unusedFilesRatio = data.unusedFiles.length / totalFiles;
        
        const rawScore = 100 - (unusedDepsRatio * 60 + unusedFilesRatio * 40);
        const healthScore = Math.max(0, Math.min(100, Math.round(rawScore)));
        setHealthScore(healthScore);

        document.getElementById("metric-active-code").textContent = `${totalFiles - data.unusedFiles.length} files`;
        document.getElementById("metric-dark-matter").textContent = `${data.unusedFiles.length} files / ${data.unusedDeps.length} packages`;
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
    }
  }

  // Fetch Audit Logs
  async function fetchHistoryLogs() {
    const tableBody = document.getElementById("history-log-rows");
    if (!tableBody) return;

    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      
      if (data.ok && data.history && data.history.length > 0) {
        tableBody.innerHTML = "";
        data.history.forEach(log => {
          const tr = document.createElement("tr");
          
          // Timestamp
          const dateTd = document.createElement("td");
          dateTd.textContent = new Date(log.timestamp).toLocaleString();
          tr.appendChild(dateTd);

          // Action
          const actionTd = document.createElement("td");
          actionTd.innerHTML = `<strong>${log.action.toUpperCase()}</strong>`;
          tr.appendChild(actionTd);

          // Status
          const statusTd = document.createElement("td");
          const statusClass = log.status === "success" ? "ok" : "text-danger";
          statusTd.innerHTML = `<span class="${statusClass}">${log.status.toUpperCase()}</span>`;
          tr.appendChild(statusTd);

          // Details
          const detailsTd = document.createElement("td");
          detailsTd.textContent = log.details || "—";
          tr.appendChild(detailsTd);

          // Branch / PR
          const prTd = document.createElement("td");
          if (log.prUrl) {
            prTd.innerHTML = `<a href="${log.prUrl}" target="_blank" class="text-primary">View PR ↗</a>`;
          } else if (log.branch) {
            prTd.innerHTML = `<span class="mono">${log.branch}</span>`;
          } else {
            prTd.textContent = "—";
          }
          tr.appendChild(prTd);

          tableBody.appendChild(tr);
        });
      } else {
        tableBody.innerHTML = `<tr><td colspan="5" class="empty-table">No logs recorded yet. Run a scan or cleanup to populate.</td></tr>`;
      }
    } catch (err) {
      console.error("Failed to fetch logs", err);
    }
  }

  // Run Audit
  const btnRunAudit = document.getElementById("btn-run-audit");
  const btnRunCleanup = document.getElementById("btn-run-cleanup");
  const scannerLoading = document.getElementById("scanner-loading");
  const scanResults = document.getElementById("scan-results");
  const loadingTitle = document.getElementById("loading-title");
  const loadingDesc = document.getElementById("loading-desc");

  if (btnRunAudit) {
    btnRunAudit.addEventListener("click", () => runScan(false));
  }
  if (btnRunCleanup) {
    btnRunCleanup.addEventListener("click", () => runScan(true));
  }
  if (document.getElementById("btn-quick-scan")) {
    document.getElementById("btn-quick-scan").addEventListener("click", () => {
      document.getElementById("btn-tab-scanner").click();
      runScan(false);
    });
  }

  async function runScan(cleanup = false) {
    // Show loading UI
    scannerLoading.classList.remove("hidden");
    scanResults.classList.add("hidden");
    
    if (cleanup) {
      loadingTitle.textContent = "Cleaning codebase & opening PR...";
      loadingDesc.textContent = "Running Knip and Depcheck, deleting unused files, uninstalling packages, committing and pushing changes.";
    } else {
      loadingTitle.textContent = "Auditing codebase...";
      loadingDesc.textContent = "Running Knip and Depcheck analysis in the background.";
    }

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cleanup })
      });
      const data = await res.json();

      if (data.ok) {
        // Populate results
        document.getElementById("count-unused-files").textContent = data.unusedFiles.length;
        document.getElementById("count-unused-deps").textContent = data.unusedDeps.length;
        document.getElementById("count-unused-exports").textContent = data.unusedExports.length;

        // Populate lists
        const listFiles = document.getElementById("list-unused-files");
        const listDeps = document.getElementById("list-unused-deps");
        const listExports = document.getElementById("list-unused-exports");

        // Files
        if (data.unusedFiles.length > 0) {
          listFiles.innerHTML = data.unusedFiles.map(f => `
            <div class="result-item">
              <span>${f}</span>
              <span class="result-meta text-danger">${cleanup ? "Deleted" : "Unused File"}</span>
            </div>
          `).join("");
        } else {
          listFiles.innerHTML = `<div class="result-item result-empty">No unused files found.</div>`;
        }

        // Deps
        if (data.unusedDeps.length > 0) {
          listDeps.innerHTML = data.unusedDeps.map(d => `
            <div class="result-item">
              <span>${d}</span>
              <span class="result-meta text-danger">${cleanup ? "Uninstalled" : "Unused Package"}</span>
            </div>
          `).join("");
        } else {
          listDeps.innerHTML = `<div class="result-item result-empty">No unused dependencies found.</div>`;
        }

        // Exports
        if (data.unusedExports.length > 0) {
          listExports.innerHTML = data.unusedExports.map(e => `
            <div class="result-item">
              <span>${e.file}: <strong>${e.name}</strong></span>
              <span class="result-meta text-warning">Manual Review Needed</span>
            </div>
          `).join("");
        } else {
          listExports.innerHTML = `<div class="result-item result-empty">No unused exports found.</div>`;
        }

        scanResults.classList.remove("hidden");
      }
    } catch (err) {
      console.error("Scan error", err);
    } finally {
      scannerLoading.classList.add("hidden");
    }
  }

  // Panic Button Actions
  const panicConfirm = document.getElementById("panic-confirm");
  const btnTriggerPanic = document.getElementById("btn-trigger-panic");
  const panicModal = document.getElementById("panic-modal");
  const modalLoadingState = document.getElementById("modal-loading-state");
  const modalSuccessState = document.getElementById("modal-success-state");
  const successMessage = document.getElementById("success-message");
  const prLinkContainer = document.getElementById("modal-pr-link-container");
  const btnCloseModal = document.getElementById("btn-close-modal");

  if (panicConfirm) {
    panicConfirm.addEventListener("change", (e) => {
      btnTriggerPanic.disabled = !e.target.checked;
    });
  }

  if (btnTriggerPanic) {
    btnTriggerPanic.addEventListener("click", async () => {
      const sha = document.getElementById("panic-sha").value.trim();
      const reason = document.getElementById("panic-reason").value.trim();

      // Show modal in loading state
      panicModal.classList.remove("hidden");
      modalLoadingState.classList.remove("hidden");
      modalSuccessState.classList.add("hidden");

      try {
        const res = await fetch("/api/revert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sha, reason })
        });
        const data = await res.json();

        if (data.ok) {
          modalLoadingState.classList.add("hidden");
          modalSuccessState.classList.remove("hidden");
          
          successMessage.textContent = `Successfully reverted commit ${data.revertSha.substring(0, 7)}: "${data.originalSubject}"`;
          
          if (data.prUrl) {
            prLinkContainer.innerHTML = `<a href="${data.prUrl}" target="_blank">View Recovery PR on GitHub ↗</a><br/><small class="text-muted">Branch: ${data.branch}</small>`;
          } else {
            prLinkContainer.innerHTML = `Recovery branch created: <span class="mono">${data.branch}</span>`;
          }
        } else {
          // Error handling
          modalLoadingState.classList.add("hidden");
          panicModal.classList.add("hidden");
          alert(`Panic revert failed: ${data.error || "Unknown error"}`);
        }
      } catch (err) {
        console.error("Panic trigger error", err);
        modalLoadingState.classList.add("hidden");
        panicModal.classList.add("hidden");
        alert("Server communication error during panic trigger.");
      }
    });
  }

  if (btnCloseModal) {
    btnCloseModal.addEventListener("click", () => {
      panicModal.classList.add("hidden");
      // Reset form
      document.getElementById("panic-sha").value = "";
      document.getElementById("panic-reason").value = "";
      panicConfirm.checked = false;
      btnTriggerPanic.disabled = true;
    });
  }

  // Initial dashboard load
  fetchDashboardStatus();
});
