let refreshTimer = null;







let currentPage = 1;







const pageSize = 10;







let allSites = [];







let allStatus = [];







let rcsCurrentPage = 1;







const rcsPageSize = 10;







let rcsTaskData = [];















function normalize(str) {







  return (str || '').replace(/\s+/g, '').replace(/／/g, '').toUpperCase();







}















function setError(msg) {







  const el = document.getElementById('error');







  if (!el) return;







  if (msg) {







    el.innerHTML = '<div class="error-msg">' + escapeHtml(msg) + '</div>';







  } else {







    el.innerHTML = '';







  }







}















function setLastUpdate(ts) {







  const el = document.getElementById('lastUpdate');







  if (!el) return;







  if (!ts) { el.textContent = ''; return; }







  const now = new Date(ts);







  const h = String(now.getHours()).padStart(2, '0');







  const m = String(now.getMinutes()).padStart(2, '0');







  const s = String(now.getSeconds()).padStart(2, '0');







  el.textContent = '更新于 ' + h + ':' + m + ':' + s;







}















function statusText(val) {







  if (val === 9 || val === '9') return '已完成';







  if (val === 0 || val === '0') return '未执行';







  if (val === 5 || val === '5') return '已取消';







  if (val === undefined || val === null || val === '') return '';







  return '执行中';







}















function statusBadgeClass(val) {







  if (val === 9 || val === '9') return 'done';







  if (val === 0 || val === '0') return '';







  if (val === 5 || val === '5') return 'cancelled';







  return 'running';







}















function escapeHtml(value) {







  return String(value ?? '')







    .replace(/&/g, '&amp;')







    .replace(/</g, '&lt;')







    .replace(/>/g, '&gt;')







    .replace(/"/g, '&quot;')







    .replace(/'/g, '&#39;');







}















function showRcsTaskModal() {







  const modal = document.getElementById('rcsTaskModal');







  if (!modal) return;







  modal.classList.add('visible');







  modal.style.display = 'flex';







  const result = document.getElementById('rcsTaskResult');







  if (result) result.innerHTML = '<div class="empty-state"><span>请输入条件后点击查询</span></div>';







  rcsCurrentPage = 1;







  rcsTaskData = [];







}















function hideRcsTaskModal() {







  const modal = document.getElementById('rcsTaskModal');







  if (!modal) return;







  modal.classList.remove('visible');







  modal.style.display = 'none';







}















function getFilteredSites() {







  const searchVal = (document.getElementById('searchInput')?.value || '').trim();







  const activeType = document.querySelector('.filter-bar .btn-ghost.active')?.dataset.type || '';







  const activeMap = document.querySelector('.map-filter-bar .btn-ghost.active')?.dataset.map || '';







  const activeCarrier = document.querySelector('.carrier-filter-bar .btn-carrier-filter.active')?.dataset.carrier || '';







  const sites = (allSites || []).filter((item) => {







    if (!item.site_name) return false;







    const up = item.site_name.toUpperCase();







    if (up[0] === 'X' || up.startsWith('TB')) return false;







    if (activeType && item.site_type !== activeType) return false;







    if (activeMap && item.map_code !== activeMap) return false;







    const s = (allStatus || []).find(function(a) { return a.site_code === item.site_code; }) || {};







    const ccd = s.carrier_code_display || '';







    const hasCarrier = ccd && ccd !== '无载具' && ccd !== '空台车';







    if (activeCarrier === 'has' && !hasCarrier) return false;







    if (activeCarrier === 'no' && hasCarrier) return false;







    if (searchVal && !item.site_name.includes(searchVal) && !(item.map_name && item.map_name.includes(searchVal))) return false;







    return true;







  });







  return sites;







}















function groupSitesByMap(sites) {







  const groups = {};







  for (const s of sites) {







    const mc = s.map_code || 'OTHER';







    if (!groups[mc]) groups[mc] = { map_code: mc, map_name: s.map_name || mc, sites: [] };







    groups[mc].sites.push(s);







  }







  const sorted = Object.values(groups).sort((a, b) => {







    return (a.map_name || '').localeCompare(b.map_name || '', 'zh-CN', { numeric: true });







  });







  for (const g of sorted) {







    g.sites.sort((a, b) => {







      const nameCmp = a.site_name.localeCompare(b.site_name, 'zh-CN', { numeric: true });







      if (nameCmp !== 0) return nameCmp;







      return a.site_code.localeCompare(b.site_code, 'zh-CN', { numeric: true });







    });







  }







  return sorted;







}























function buildMapFilters() {







  // 从 allSites 提取去重地图列表，按 map_name 中文排序







  const mapMap = {};







  for (const s of allSites || []) {







    const mc = s.map_code || '';







    const mn = s.map_name || mc;







    if (mc && !mapMap[mc]) mapMap[mc] = mn;







  }







  const mapList = Object.keys(mapMap).map(function(mc) {







    return { map_code: mc, map_name: mapMap[mc] };







  }).sort(function(a, b) {







    return (a.map_name || '').localeCompare(b.map_name || '', 'zh-CN', { numeric: true });







  });















  // 动态生成主页地图类型按钮







  const btnsContainer = document.getElementById('mapFilterBtns');







  if (btnsContainer) {







    let html = '';







    for (const m of mapList) {







      html += '<button class="btn btn-sm btn-ghost" data-map="' + escapeHtml(m.map_code) + '">' + escapeHtml(m.map_name) + '</button>';







    }







    btnsContainer.innerHTML = html;







  }















  // 动态生成任务查询下拉框选项







  const sel = document.getElementById('rcsMapCode');







  if (sel) {







    let html = '<option value="">全部</option>';







    for (const m of mapList) {







      html += '<option value="' + escapeHtml(m.map_code) + '">' + escapeHtml(m.map_name) + '</option>';







    }







    sel.innerHTML = html;







  }







}























function renderAllStatus() {







  const container = document.getElementById('allStatus');







  if (!container) return;















  const statusMap = {};







  for (const s of allStatus || []) {







    statusMap[s.site_code] = s;







  }















  const validSites = getFilteredSites();







  const mapGroups = groupSitesByMap(validSites);















  if (mapGroups.length === 0) {







    container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><span>未找到匹配的站点</span></div>';







    return;







  }















  let html = '';







  for (const group of mapGroups) {







    html += '<div class="map-group">';







    html += '<div class="map-group-header">';







    html += '<div class="map-group-title"><span>' + escapeHtml(group.map_name) + '</span><span class="map-group-code">' + escapeHtml(group.map_code) + '</span></div>';







    html += '<span class="map-group-count">' + group.sites.length + ' 个站点</span>';







    html += '</div>';







    html += '<table class="site-table"><thead><tr>';







    html += '<th style="width:22%">站点名称</th>';







    html += '<th style="width:16%">类型</th>';







    html += '<th style="width:22%">站点编号</th>';







    html += '<th style="width:20%">载具编号</th>';







    html += '<th style="width:20%">载具类型</th>';







    html += '</tr></thead><tbody>';















    for (const site of group.sites) {







      const status = statusMap[site.site_code] || {};







      const isNoCarrier = !status.carrier_code_display || status.carrier_code_display === '空台车' || status.carrier_code_display === '无载具';







      const dotClass = isNoCarrier ? 'red' : 'blue';







      const nameClass = isNoCarrier ? 'site-name-cell empty' : 'site-name-cell';







      const carrierClass = isNoCarrier ? 'carrier-cell no-carrier' : 'carrier-cell has-carrier';







      const carrierText = isNoCarrier ? '无载具' : escapeHtml(status.carrier_code_display || '');















      html += '<tr>';







      html += '<td class="' + nameClass + '"><span class="status-dot ' + dotClass + '"></span>' + escapeHtml(site.site_name) + '</td>';







      html += '<td><span class="type-badge">' + escapeHtml(site.site_type_name || '') + '</span></td>';







      html += '<td class="site-code-cell">' + escapeHtml(site.site_code) + '</td>';







      html += '<td class="' + carrierClass + '">' + carrierText + '</td>';







      html += '<td>' + escapeHtml(status.carrier_type || '') + '</td>';







      html += '</tr>';







    }















    html += '</tbody></table></div>';







  }















  html += '<div class="summary-bar">共 <strong>' + validSites.length + '</strong> 个站点</div>';







  container.innerHTML = html;







}















async function fetchAllStatus() {







  setError('');







  try {







    const [resSites, resStatus] = await Promise.all([







      fetch('/api/agv/site-codes'),







      fetch('/api/agv/site-status?limit=500')







    ]);







    const jsonSites = await resSites.json();







    const jsonStatus = await resStatus.json();















    if (!jsonSites.success) {







      if (jsonSites.message && jsonSites.message.includes('数据库未连接')) {







        throw new Error('数据库未连接，请先登录');







      }







      throw new Error(jsonSites.message || '加载站点列表失败');







    }







    if (!jsonStatus.success) {







      if (jsonStatus.message && jsonStatus.message.includes('数据库未连接')) {







        throw new Error('数据库未连接，请先登录');







      }







      throw new Error(jsonStatus.message || '加载站点状态失败');







    }















    allSites = Array.isArray(jsonSites.data) ? jsonSites.data : [];







    allStatus = Array.isArray(jsonStatus.data) ? jsonStatus.data : [];







    buildMapFilters();







    renderAllStatus();







    setLastUpdate(Date.now());







  } catch (err) {







    // 如果是数据库未连接错误，显示登录引导







    if (err.message && err.message.includes('数据库未连接')) {







      var errorEl = document.getElementById('error');







      if (errorEl) {







        errorEl.innerHTML = '<div class="error-msg" style="font-size:1rem;padding:20px;text-align:center;"><p style="margin-bottom:12px;">' + err.message + '</p><button class="btn btn-primary" id="gotoLoginBtn" style="padding:10px 24px;font-size:0.95rem;">前往登录</button></div>';







        setTimeout(function() {







          var btn = document.getElementById('gotoLoginBtn');







          if (btn) {







            btn.addEventListener('click', function() {







              window.location.href = '/';







            });







          }







        }, 100);







      }







    } else {







      setError(err?.message || '加载失败');







    }







  }







}















async function renderRcsTaskResult(data) {







  const resultEl = document.getElementById('rcsTaskResult');







  if (!resultEl) return;















  if (!data || !data.length) {







    rcsTaskData = [];







    rcsCurrentPage = 1;







    resultEl.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><span>未查询到任务</span></div>';







    return;







  }







  rcsTaskData = data;















  const codeNameMap = {};







  try {







    const resSites = await fetch('/api/agv/site-codes');







    const jsonSites = await resSites.json();







    if (jsonSites.success && Array.isArray(jsonSites.data)) {







      for (const s of jsonSites.data) {







        if (s.site_code && s.site_name) codeNameMap[String(s.site_code)] = s.site_name;







      }







    }







  } catch (e) { /* ignore */ }















  // 地图过滤已由后端 map_code 参数完成，无需前端二次过滤







  // 地图过滤已由后端 map_code 参数完成，无需前端二次过滤















  const totalPages = Math.max(1, Math.ceil(rcsTaskData.length / rcsPageSize));







  if (rcsCurrentPage > totalPages) rcsCurrentPage = totalPages;







  const startIdx = (rcsCurrentPage - 1) * rcsPageSize;







  const pageRows = rcsTaskData.slice(startIdx, startIdx + rcsPageSize);















  let html = '<div class="task-table-wrap">';







  html += '<div class="task-count-info">共查询到 <strong>' + rcsTaskData.length + '</strong> 条任务，当前第 ' + rcsCurrentPage + ' 页，显示第 ' + (startIdx + 1) + ' - ' + Math.min(startIdx + rcsPageSize, rcsTaskData.length) + ' 条</div>';







  html += '<table class="task-table"><thead><tr>';







    html += '<th style="width:5%">#</th><th style="width:10%">载具</th><th style="width:8%">类型</th><th style="width:11%">任务编号</th><th style="width:6%">设备</th>';







    html += '<th style="width:16%">起点</th><th style="width:16%">终点</th><th style="width:9%">任务类型</th><th style="width:8%">状态</th><th style="width:11%">创建时间</th>';







  html += '</tr></thead><tbody>';















  for (let i = 0; i < pageRows.length; i++) {







    const row = pageRows[i];







    const seqNum = startIdx + i + 1;







    const startCode = row.start_route_code ? String(row.start_route_code) : '';







    const endCode = row.end_route_code ? String(row.end_route_code) : '';







    const startName = startCode ? (codeNameMap[startCode] || startCode) : '';







    const endName = endCode ? (codeNameMap[endCode] || endCode) : '';







    const startMapLabel = row.start_map_name ? (' [' + row.start_map_name + ']') : '';







    const endMapLabel = row.end_map_name ? (' [' + row.end_map_name + ']') : '';







    const startText = startCode ? (startName + startMapLabel) : '';







    const endText = endCode ? (endName + endMapLabel) : '';







    const stVal = row.task_status;







    const stText = row.task_status_display || statusText(stVal);







    const stClass = statusBadgeClass(stVal);







    const badgeHtml = stClass ? ('<span class="status-badge ' + stClass + '">' + escapeHtml(stText) + '</span>') : escapeHtml(stText);















    html += '<tr>';







    html += '<td style="color:var(--color-gray-400);font-size:0.8rem;text-align:center;">' + seqNum + '</td>';







    html += '<td style="font-weight:600;">' + escapeHtml(row.carrier_code || '') + '</td>';







    html += '<td>' + escapeHtml(row.carrier_type || '') + '</td>';







    html += '<td><span class="task-code-link" title="点击展开/收起" data-full="' + escapeHtml(row.task_chain_code || '') + '">' + escapeHtml(row.task_chain_code || '') + '</span></td>';







    html += '<td>' + escapeHtml(row.amr_code || '') + '</td>';







    html += '<td title="' + escapeHtml(startText) + '">' + escapeHtml(startText) + '</td>';







    html += '<td title="' + escapeHtml(endText) + '">' + escapeHtml(endText) + '</td>';







    html += '<td>' + escapeHtml(row.task_chain_type_name || '') + '</td>';







    html += '<td>' + badgeHtml + '</td>';







    html += '<td style="color:var(--color-gray-500);font-size:0.82rem;">' + escapeHtml(row.create_time ? new Date(row.create_time).toLocaleString() : '') + '</td>';







    html += '</tr>';







  }















  html += '</tbody></table></div>';







  html += '<div class="pagination">';







  html += '<button class="btn btn-sm btn-ghost" id="rcsPrevPageBtn"' + (rcsCurrentPage === 1 ? ' disabled' : '') + '>上一页</button>';







  html += '<span class="page-info">第 ' + rcsCurrentPage + ' / ' + totalPages + ' 页</span>';







  html += '<button class="btn btn-sm btn-ghost" id="rcsNextPageBtn"' + (rcsCurrentPage === totalPages ? ' disabled' : '') + '>下一页</button>';







  html += '</div>';







  resultEl.innerHTML = html;















  // Bind events







  const prevBtn = document.getElementById('rcsPrevPageBtn');







  const nextBtn = document.getElementById('rcsNextPageBtn');







  const taskCodeEls = resultEl.querySelectorAll('.task-code-link');















  if (prevBtn) prevBtn.onclick = async function() {







    if (rcsCurrentPage > 1) { rcsCurrentPage--; await renderRcsTaskResult(rcsTaskData); }







  };







  if (nextBtn) nextBtn.onclick = async function() {







    if (rcsCurrentPage < totalPages) { rcsCurrentPage++; await renderRcsTaskResult(rcsTaskData); }







  };







  for (const el of taskCodeEls) {







    el.addEventListener('click', function() { el.classList.toggle('expanded'); });







  }







}















async function onRcsTaskSubmit(e) {







  e.preventDefault();







  const resultEl = document.getElementById('rcsTaskResult');







  if (resultEl) resultEl.innerHTML = '<div class="empty-state"><span>查询中...</span></div>';







  rcsCurrentPage = 1;















  const carrierCode = document.getElementById('rcsCarrierCode')?.value.trim();







  const taskCode = document.getElementById('rcsTaskCode')?.value.trim();







  const amrCode = document.getElementById('rcsAmrCode')?.value.trim();







  const startInput = document.getElementById('rcsStartSiteCode')?.value.trim();







  const endInput = document.getElementById('rcsEndSiteCode')?.value.trim();















  const siteNameToCode = {};







  try {







    const resSites = await fetch('/api/agv/site-codes');







    const jsonSites = await resSites.json();







    if (jsonSites.success && Array.isArray(jsonSites.data)) {







      for (const s of jsonSites.data) {







        if (s.site_name && s.site_code) siteNameToCode[normalize(s.site_name)] = String(s.site_code);







      }







    }







  } catch (e) { /* ignore */ }















  const params = [];







  if (carrierCode) params.push('carrier_code=' + encodeURIComponent(carrierCode));







  if (taskCode) params.push('task_chain_code=' + encodeURIComponent(taskCode));







  if (amrCode) params.push('amr_code=' + encodeURIComponent(amrCode));







  if (startInput) {







    const norm = normalize(startInput);







    params.push('start_route_code=' + encodeURIComponent(siteNameToCode[norm] || norm));







  }







  if (endInput) {







    const norm = normalize(endInput);







    params.push('end_route_code=' + encodeURIComponent(siteNameToCode[norm] || norm));







  }















  const mapCode = document.getElementById('rcsMapCode')?.value || '';







  if (mapCode) params.push('map_code=' + encodeURIComponent(mapCode));















  const url = '/api/agv/rcs-tasks?' + params.join('&');







  try {







    const res = await fetch(url);







    const json = await res.json();







    if (!json.success) throw new Error(json.message || '查询失败');







    await renderRcsTaskResult(json.data);







  } catch (err) {







    if (resultEl) resultEl.innerHTML = '<div class="empty-state"><span style="color:var(--color-danger);">' + escapeHtml(err?.message || '查询失败') + '</span></div>';







  }







}















function setupAutoRefresh() {







  if (refreshTimer) clearInterval(refreshTimer);







  refreshTimer = setInterval(fetchAllStatus, 2 * 60 * 60 * 1000);







}















function initPage() {







  const btn = document.getElementById('btnRcsTaskQuery');







  const closeBtn = document.getElementById('rcsTaskModalClose');







  const form = document.getElementById('rcsTaskForm');







  const searchInput = document.getElementById('searchInput');







  const modal = document.getElementById('rcsTaskModal');















  if (btn) btn.onclick = showRcsTaskModal;







  if (closeBtn) closeBtn.onclick = hideRcsTaskModal;







  if (form) form.onsubmit = onRcsTaskSubmit;















  // Click outside modal to close







  if (modal) {







    modal.addEventListener('click', function(e) {







      if (e.target === modal) hideRcsTaskModal();







    });







  }















  // ESC to close modal







  document.addEventListener('keydown', function(e) {







    if (e.key === 'Escape') hideRcsTaskModal();







  });















  if (searchInput) {







    searchInput.addEventListener('input', function() {







      currentPage = 1;







      renderAllStatus();







    });







  }















  // Site type filter buttons







  document.querySelectorAll('.filter-bar .btn-ghost').forEach(function(b) {







    b.addEventListener('click', function() {







      document.querySelectorAll('.filter-bar .btn-ghost').forEach(function(x) { x.classList.remove('active'); });







      b.classList.add('active');







      currentPage = 1;







      renderAllStatus();







    });







  });















  // Map type filter buttons (event delegation)







  const mapFilterBar = document.querySelector('.map-filter-bar');







  if (mapFilterBar) {







    mapFilterBar.addEventListener('click', function(e) {







      const btn = e.target.closest('.btn-ghost');







      if (!btn) return;







      mapFilterBar.querySelectorAll('.btn-ghost').forEach(function(x) { x.classList.remove('active'); });







      btn.classList.add('active');







      currentPage = 1;







      renderAllStatus();







    });







  }























  // Carrier filter buttons







  document.querySelectorAll('.carrier-filter-bar .btn-carrier-filter').forEach(function(b) {







    b.addEventListener('click', function() {







      document.querySelectorAll('.carrier-filter-bar .btn-carrier-filter').forEach(function(x) { x.classList.remove('active'); });







      b.classList.add('active');







      currentPage = 1;







      renderAllStatus();







    });







  });















  // Reset all main page filters







  const resetAllBtn = document.getElementById('resetAllFilters');







  if (resetAllBtn) {







    resetAllBtn.addEventListener('click', function() {







      document.querySelectorAll('.filter-bar .btn-ghost').forEach(function(b) { b.classList.remove('active'); });







      document.querySelector('.filter-bar .btn-ghost[data-type=""]').classList.add('active');







      if (document.querySelector('.map-filter-bar')) {







        document.querySelectorAll('.map-filter-bar .btn-ghost').forEach(function(b) { b.classList.remove('active'); });







        var allBtn = document.querySelector('.map-filter-bar .btn-ghost[data-map=""]');







        if (allBtn) allBtn.classList.add('active');







      }







      document.querySelectorAll('.carrier-filter-bar .btn-carrier-filter').forEach(function(b) { b.classList.remove('active'); });







      document.querySelector('.carrier-filter-bar .btn-carrier-filter[data-carrier=""]').classList.add('active');







      currentPage = 1;







      renderAllStatus();







    });







  }















  // Refresh page button















  // 刷新数据缓存按钮（新增点位后无需重启服务）







  const reloadCacheBtn = document.getElementById("reloadCacheBtn");







  if (reloadCacheBtn) {







    reloadCacheBtn.addEventListener("click", async function() {







      if (reloadCacheBtn.classList.contains("loading")) return;







      reloadCacheBtn.classList.add("loading");







      const origText = reloadCacheBtn.textContent;







      reloadCacheBtn.textContent = "刷新中...";







      try {







        const resp = await fetch("/api/agv/reload-cache", { method: "POST" });







        const result = await resp.json();







        if (result.success) {







          reloadCacheBtn.textContent = "已刷新 ✓";







          location.reload();







        } else {







          reloadCacheBtn.textContent = "失败";







          alert("缓存刷新失败：" + (result.message || ""));







          setTimeout(function() { reloadCacheBtn.textContent = origText; }, 2000);







        }







      } catch (e) {







        reloadCacheBtn.textContent = "失败";







        alert("请求错误：" + e.message);







        setTimeout(function() { reloadCacheBtn.textContent = origText; }, 2000);







      } finally {







        reloadCacheBtn.classList.remove("loading");







      }







    });







  }















  // Reset button







  const resetBtn = document.getElementById('rcsResetBtn');







  if (resetBtn) {







    resetBtn.addEventListener('click', function() {







      var form = document.getElementById('rcsTaskForm');







      if (form) {







        form.querySelectorAll('input').forEach(function(inp) { inp.value = ''; });







        var sel = form.querySelector('select');







        if (sel) sel.selectedIndex = 0;







      }







      var resultEl = document.getElementById('rcsTaskResult');







      if (resultEl) resultEl.innerHTML = '<div class="empty-state"><span>请输入条件后点击查询</span></div>';







      rcsTaskData = [];







      rcsCurrentPage = 1;







    });







  }















  // 检查是否有登录配置







  var hasConfig = localStorage.getItem('agv_db_config');







  if (!hasConfig) {







    var errorEl = document.getElementById('error');







    if (errorEl) {







      errorEl.innerHTML = '<div class="error-msg" style="font-size:1rem;padding:20px;text-align:center;"><p style="margin-bottom:12px;">需要登录才能访问数据页面</p><button class="btn btn-primary" id="gotoLoginBtn" style="padding:10px 24px;font-size:0.95rem;">前往登录</button></div>';







      setTimeout(function() {







        var btn = document.getElementById('gotoLoginBtn');







        if (btn) {







          btn.addEventListener('click', function() {







            window.location.href = '/';







          });







        }







      }, 100);







    }







    // 不加载数据







    return;







  }















  fetchAllStatus();







  setupAutoRefresh();







  setupAlarmHistory();















  // 绑定退出登录按钮







  var logoutBtn = document.getElementById('btnLogout');







  if (logoutBtn) {







    logoutBtn.addEventListener('click', function() {







      if (confirm('确定要退出登录吗？')) {







        // 调用服务器端退出接口







        fetch('/api/agv/logout', { method: 'POST' })







          .then(function() {







            window.location.href = '/';







          })







          .catch(function() {







            // 即使请求失败也跳转







            window.location.href = '/';







          });







      }







    });







  }







}























// ==================== Alarm History Functions ====================















// Alarm state







let currentAlarmPage = 1;







let totalAlarmPages = 1;







const alarmPageSize = 10;















function setupAlarmHistory() {







  var alarmHistoryBtn = document.getElementById("alarmHistoryBtn");







  var alarmHistoryModal = document.getElementById("alarmHistoryModal");







  var closeAlarmModal = document.getElementById("closeAlarmModal");







  var refreshAlarmBtn = document.getElementById("refreshAlarmBtn");







  var queryAlarmBtn = document.getElementById("queryAlarmBtn");







  var clearAlarmBtn = document.getElementById("clearAlarmBtn");







  var deviceCodeInput = document.getElementById("deviceCodeInput");















  if (alarmHistoryBtn) {







    alarmHistoryBtn.addEventListener("click", function() {







      showAlarmHistoryModal();







    });







  }















  if (closeAlarmModal) {







    closeAlarmModal.addEventListener("click", function() {







      hideAlarmHistoryModal();







    });







  }















  // Click outside modal to close







  if (alarmHistoryModal) {







    alarmHistoryModal.addEventListener("click", function(e) {







      if (e.target === alarmHistoryModal) hideAlarmHistoryModal();







    });







  }















  if (refreshAlarmBtn) {







    refreshAlarmBtn.addEventListener("click", function() {







      queryAlarmHistory(currentAlarmPage);







    });







  }















  if (queryAlarmBtn) {







    queryAlarmBtn.addEventListener("click", function() {







      currentAlarmPage = 1;







      queryAlarmHistory(1);







    });







  }















  if (clearAlarmBtn) {







    clearAlarmBtn.addEventListener("click", function() {







      clearAlarmQueryForm();







      queryAlarmHistory(1);







    });







  }















  if (deviceCodeInput) {







    deviceCodeInput.addEventListener("keypress", function(e) {







      if (e.key === "Enter") {







        currentAlarmPage = 1;







        queryAlarmHistory(1);







      }







    });







  }







}















function showAlarmHistoryModal() {







  var modal = document.getElementById("alarmHistoryModal");







  if (modal) {







    modal.style.display = "flex";







    var deviceCodeInput = document.getElementById("deviceCodeInput");







    var alarmContentInput = document.getElementById("alarmContentInput");







    var hideContentInput = document.getElementById("hideContentInput");







    if (deviceCodeInput) deviceCodeInput.value = "";







    if (alarmContentInput) alarmContentInput.value = "";







    if (hideContentInput) hideContentInput.value = "";







    setTodayTimeRange();







    queryAlarmHistory(1);







  }







}















function hideAlarmHistoryModal() {







  var modal = document.getElementById("alarmHistoryModal");







  if (modal) modal.style.display = "none";







}















function setTodayTimeRange() {







  var now = new Date();







  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);







  var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);















  function formatDT(d) {







    var y = d.getFullYear();







    var m = String(d.getMonth() + 1).padStart(2, "0");







    var day = String(d.getDate()).padStart(2, "0");







    var h = String(d.getHours()).padStart(2, "0");







    var min = String(d.getMinutes()).padStart(2, "0");







    return y + "-" + m + "-" + day + "T" + h + ":" + min;







  }















  var startInput = document.getElementById("startDateInput");







  var endInput = document.getElementById("endDateInput");







  if (startInput) startInput.value = formatDT(todayStart);







  if (endInput) endInput.value = formatDT(todayEnd);







}















function clearAlarmQueryForm() {







  var deviceCodeInput = document.getElementById("deviceCodeInput");







  var alarmContentInput = document.getElementById("alarmContentInput");







  var hideContentInput = document.getElementById("hideContentInput");







  if (deviceCodeInput) deviceCodeInput.value = "";







  if (alarmContentInput) alarmContentInput.value = "";







  if (hideContentInput) hideContentInput.value = "";







  currentAlarmPage = 1;







  totalAlarmPages = 1;







  setTodayTimeRange();







  var resultEl = document.getElementById("alarmResultContent");







  if (resultEl) {







    resultEl.innerHTML = '<div class="alarm-empty-state">' +







      '<div class="alarm-empty-icon">🚨</div>' +







      '<div class="alarm-empty-title">告警历史查询</div>' +







      '<div class="alarm-empty-desc">打开后将自动显示当天的告警记录，您也可以设置其他查询条件进行筛选</div>' +







      '</div>';







  }







}















async function queryAlarmHistory(page) {







  page = page || 1;







  currentAlarmPage = page;







  var resultEl = document.getElementById("alarmResultContent");







  if (!resultEl) return;















  resultEl.innerHTML = '<div class="alarm-loading-state">' +







    '<div class="alarm-loading-spinner"></div>' +







    '<div>正在查询告警数据...</div></div>';















  try {







    var params = new URLSearchParams();







    var deviceCodeInput = document.getElementById("deviceCodeInput");







    var startDateInput = document.getElementById("startDateInput");







    var endDateInput = document.getElementById("endDateInput");







    var alarmContentInput = document.getElementById("alarmContentInput");















    if (deviceCodeInput && deviceCodeInput.value.trim()) {







      params.append("source_code", deviceCodeInput.value.trim());







    }







    if (alarmContentInput && alarmContentInput.value.trim()) {







      params.append("alarm_content", alarmContentInput.value.trim());







    }







    var hideContentInput = document.getElementById("hideContentInput");







    if (hideContentInput && hideContentInput.value.trim()) {







      params.append("hide_content", hideContentInput.value.trim());







    }







    if (startDateInput && startDateInput.value) {







      params.append("begin_date", startDateInput.value);







    }







    if (endDateInput && endDateInput.value) {







      params.append("end_date", endDateInput.value);







    }







    params.append("page", page);







    params.append("pageSize", alarmPageSize);















    var response = await fetch("/api/agv/alarm-history?" + params.toString());







    var result = await response.json();















    if (result.success) {







      displayAlarmResults(result.data, result.pagination);







    } else {







      resultEl.innerHTML = '<div class="alarm-empty-state">' +







        '<div class="alarm-empty-icon">⚠️</div>' +







        '<div class="alarm-empty-title">查询失败</div>' +







        '<div class="alarm-empty-desc">' + (result.message || "未知错误") + '</div></div>';







    }







  } catch (error) {







    resultEl.innerHTML = '<div class="alarm-empty-state">' +







      '<div class="alarm-empty-icon">⚠️</div>' +







      '<div class="alarm-empty-title">网络请求失败</div>' +







      '<div class="alarm-empty-desc">请检查网络连接</div></div>';







  }







}















function displayAlarmResults(alarmData, pagination) {







  // 保存为全局变量，供导出功能使用






  window._currentAlarmData = alarmData;






  var resultEl = document.getElementById("alarmResultContent");







  if (!resultEl) return;















  if (!alarmData || alarmData.length === 0) {







    resultEl.innerHTML = '<div class="alarm-empty-state">' +







      '<div class="alarm-empty-icon">📋</div>' +







      '<div class="alarm-empty-title">暂无告警数据</div>' +







      '<div class="alarm-empty-desc">根据当前查询条件未找到相关告警记录</div></div>';







    return;







  }















  totalAlarmPages = pagination.total_pages;















  var html = '<div class="alarm-table-container">' +







    '<div class="alarm-table-header">' +







    '<div class="alarm-summary-with-pagination">' +







    '<div class="alarm-summary">共找到 <strong>' + pagination.total_count + '</strong> 条告警记录，当前第 <strong>' + pagination.current_page + '</strong> 页，共 <strong>' + pagination.total_pages + '</strong> 页</div>' +







    '<div class="alarm-pagination-inline">' + buildAlarmPaginationHTML(pagination) + '</div>' +







    '</div></div>' +







    '<table class="alarm-table"><thead><tr>' +







    '<th>设备编号</th><th>告警等级</th><th>告警状态</th>' +







    '<th>开始时间</th><th>结束时间</th><th>持续时间</th>' +







    '<th>告警区域</th><th>坐标位置</th>' +







    '<th>主类型 / 子类型 / 告警详情</th>' +







    '</tr></thead><tbody>';















  alarmData.forEach(function(alarm) {







    var levelClass = getAlarmLevelClass(alarm.log_level);







    var statusClass = getAlarmStatusClass(alarm.alarm_status);







    var mainTypeText = alarm.main_type_text || alarm.main_type_code || "-";







    var minorTypeText = alarm.minor_type_text || alarm.minor_type_code || "-";







    var detailText = alarm.alarm_detail || "-";







    var detailEscaped = detailText.replace(/"/g, "&quot;").replace(/'/g, "&#39;");







    // 主类型、子类型、告警详情合并到一个容器行







    html += '<tr>' +







      '<td><strong>' + (alarm.source_code || "-") + '</strong></td>' +







      '<td><span class="' + levelClass + '">' + (alarm.level_text || "-") + '</span></td>' +







      '<td><span class="' + statusClass + '">' + (alarm.status_text || "-") + '</span></td>' +







      '<td>' + (alarm.begin_date_formatted || "-") + '</td>' +







      '<td>' + (alarm.end_date_formatted || "-") + '</td>' +







      '<td><span class="alarm-duration">' + (alarm.duration || "-") + '</span></td>' +







      '<td>' + (alarm.elc_map_code_text || alarm.elc_map_code || "-") + '</td>' +







      '<td><span class="alarm-coordinates">X:' + (alarm.alarm_x || "-") + ' Y:' + (alarm.alarm_y || "-") + '</span></td>' +







      '<td>' +
        '<span style="font-weight:600;">' + mainTypeText + ' / ' + minorTypeText + '</span> ' +
        '<span style="color:#6b7280;">' + detailText + '</span>' +
      '</td>' +







      '</tr>';







  });















  html += '</tbody></table></div>';







  resultEl.innerHTML = html;







}















function getAlarmLevelClass(logLevel) {







  switch (logLevel) {







    case 1: return "alarm-level-low";







    case 2: return "alarm-level-medium";







    case 3: return "alarm-level-severe";







    default: return "alarm-level-low";







  }







}















function getAlarmStatusClass(alarmStatus) {







  if (alarmStatus === null || alarmStatus === undefined || alarmStatus === 0) {







    return "alarm-status-ended";







  }







  switch (alarmStatus) {







    case 1: return "alarm-status-started";







    case 2: return "alarm-status-pulse";







    default: return "alarm-status-ended";







  }







}















function buildAlarmPaginationHTML(pagination) {







  if (pagination.total_pages <= 1) return "";















  var html = '<div class="alarm-pagination">';







  if (pagination.has_prev) {







    html += '<button class="pagination-btn" onclick="queryAlarmHistory(' + (pagination.current_page - 1) + ')">&larr; 上一页</button>';







  }















  var startPage = Math.max(1, pagination.current_page - 2);







  var endPage = Math.min(pagination.total_pages, pagination.current_page + 2);















  if (startPage > 1) {







    html += '<button class="pagination-btn" onclick="queryAlarmHistory(1)">1</button>';







    if (startPage > 2) html += '<span class="pagination-ellipsis">...</span>';







  }















  for (var i = startPage; i <= endPage; i++) {







    var activeClass = (i === pagination.current_page) ? " active" : "";







    html += '<button class="pagination-btn' + activeClass + '" onclick="queryAlarmHistory(' + i + ')">' + i + '</button>';







  }















  if (endPage < pagination.total_pages) {







    if (endPage < pagination.total_pages - 1) html += '<span class="pagination-ellipsis">...</span>';







    html += '<button class="pagination-btn" onclick="queryAlarmHistory(' + pagination.total_pages + ')">' + pagination.total_pages + '</button>';







  }















  if (pagination.has_next) {







    html += '<button class="pagination-btn" onclick="queryAlarmHistory(' + (pagination.current_page + 1) + ')">下一页 &rarr;</button>';







  }















  html += '</div>';







  return html;







}





















  // 导出按钮事件绑定





  var exportBtn = document.getElementById('exportAlarmBtn');





  if (exportBtn) {





    exportBtn.addEventListener('click', function() {





      exportAlarmHistory();





    });





  }











document.addEventListener('DOMContentLoaded', initPage);

















/**





 * 导出告警历史为 Excel (CSV 格式，UTF-8 with BOM)





 */





function exportAlarmHistory() {
  var sourceCode = document.getElementById("deviceCodeInput") ? document.getElementById("deviceCodeInput").value : '';
  var alarmContent = document.getElementById("alarmContentInput") ? document.getElementById("alarmContentInput").value : '';
  var hideContent = document.getElementById("hideContentInput") ? document.getElementById("hideContentInput").value : '';
  var startDateInput = document.getElementById("startDateInput");
  var endDateInput = document.getElementById("endDateInput");
  var beginDate = startDateInput && startDateInput.value ? startDateInput.value : '';
  var endDate = endDateInput && endDateInput.value ? endDateInput.value : '';

  // 显示导出中提示
  var exportBtn = document.getElementById('exportAlarmBtn');
  var originalText = exportBtn ? exportBtn.textContent : '';
  if (exportBtn) {
    exportBtn.textContent = '正在导出全部数据...';
    exportBtn.disabled = true;
  }

  // 构建查询参数
  var params = new URLSearchParams();
  if (sourceCode) params.append("source_code", sourceCode);
  if (alarmContent) params.append("alarm_content", alarmContent);
  if (hideContent) params.append("hide_content", hideContent);
  if (beginDate) params.append("begin_date", beginDate);
  if (endDate) params.append("end_date", endDate);
  params.append("page", 1);
  params.append("pageSize", 10000);

  fetch('/api/agv/alarm-history?' + params.toString())
    .then(function(resp) { return resp.json(); })
    .then(function(result) {
      if (!result.success || !result.data || result.data.length === 0) {
        alert('没有可导出的数据');
        if (exportBtn) { exportBtn.textContent = originalText; exportBtn.disabled = false; }
        return;
      }

      var allData = result.data;
      var totalCount = result.pagination ? result.pagination.total_count : result.data.length;

      console.log('查询到 ' + allData.length + ' 条记录，total_count=' + totalCount);

      // 如果返回数据 < total_count，说明数据太多被截断了，需要分页拉取
      if (allData.length < totalCount) {
        var pageSize = 1000;
        var totalPages = Math.ceil(totalCount / pageSize);
        var extraPages = [];

        function fetchPage(pageNum) {
          if (pageNum > totalPages) {
            // 全部拉完了，导出
            buildAndExport(allData);
            return;
          }
          var pageParams = new URLSearchParams();
          if (sourceCode) pageParams.append("source_code", sourceCode);
          if (alarmContent) pageParams.append("alarm_content", alarmContent);
          if (hideContent) pageParams.append("hide_content", hideContent);
          if (beginDate) pageParams.append("begin_date", beginDate);
          if (endDate) pageParams.append("end_date", endDate);
          pageParams.append("page", pageNum);
          pageParams.append("pageSize", pageSize);

          return fetch('/api/agv/alarm-history?' + pageParams.toString())
            .then(function(resp) { return resp.json(); })
            .then(function(r) {
              if (r.success && r.data) {
                extraPages.push(r.data);
                return fetchPage(pageNum + 1);
              }
            });
        }

        fetchPage(2).then(function() {
          for (var e = 0; e < extraPages.length; e++) {
            allData = allData.concat(extraPages[e]);
          }
          buildAndExport(allData);
        });
      } else {
        buildAndExport(allData);
      }
    })
    .catch(function(err) {
      console.error('导出失败:', err);
      alert('导出失败，请重试');
      if (exportBtn) { exportBtn.textContent = originalText; exportBtn.disabled = false; }
    });

  function buildAndExport(data) {
    var headers = ['设备编号', '告警等级', '告警状态', '告警开始时间', '告警结束时间', '持续时间', '告警区域', 'X坐标', 'Y坐标', '主类型', '子类型', '告警详情'];

    var html = '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">' +
      '<head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>' +
      '<x:Name>告警历史</x:ExcelWorksheet>' +
      '<x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>' +
      '</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body>' +
      '<table border="1"><thead><tr>';

    for (var h = 0; h < headers.length; h++) {
      html += '<th>' + headers[h] + '</th>';
    }
    html += '</tr></thead><tbody>';

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      html += '<tr>';
      html += '<td>' + escapeHtml(row.source_code || '') + '</td>';
      html += '<td>' + escapeHtml(row.level_text || '') + '</td>';
      html += '<td>' + escapeHtml(row.status_text || '') + '</td>';
      html += '<td>' + escapeHtml(row.begin_date_formatted || '') + '</td>';
      html += '<td>' + escapeHtml(row.end_date_formatted || '') + '</td>';
      html += '<td>' + escapeHtml(row.duration || '') + '</td>';
      html += '<td>' + escapeHtml(row.elc_map_code_text || '') + '</td>';
      html += '<td>' + escapeHtml(row.alarm_x || '') + '</td>';
      html += '<td>' + escapeHtml(row.alarm_y || '') + '</td>';
      html += '<td>' + escapeHtml(row.main_type_text || '') + '</td>';
      html += '<td>' + escapeHtml(row.minor_type_text || '') + '</td>';
      html += '<td>' + escapeHtml(row.alarm_detail || '') + '</td>';
      html += '</tr>';
    }

    html += '</tbody></table></body></html>';

    var blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel;charset=utf-8;' });

    var link = document.createElement('a');
    var hrefUrl = URL.createObjectURL(blob);
    link.setAttribute('href', hrefUrl);
    var timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    link.setAttribute('download', '告警历史_' + timestamp + '.xls');
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(hrefUrl);

    console.log('导出成功，共 ' + data.length + ' 条记录');

    if (exportBtn) { exportBtn.textContent = originalText; exportBtn.disabled = false; }
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}



