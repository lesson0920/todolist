/* ==========================================================================
   Smart To-Do List Application Logic
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // Key Storage Names
  const STORAGE_KEY_TASKS = 'smart_todolist_tasks_v1';
  const STORAGE_KEY_THEME = 'smart_todolist_theme_v1';

  // Supabase Cloud Database Client (환경 변수를 통해 동적으로 초기화됩니다)
  let supabase = null;

  async function initSupabase() {
    // 1. 로컬 환경: window.ENV (env.js 파일) 확인
    let url = (window.ENV && window.ENV.SUPABASE_URL) || '';
    let key = (window.ENV && window.ENV.SUPABASE_ANON_KEY) || '';

    // 2. Vercel 배포 환경: /api/config 서버리스 엔드포인트에서 Vercel 환경 변수 가져오기
    if (!url || !key || url === 'YOUR_SUPABASE_URL') {
      try {
        const res = await fetch('/api/config');
        if (res.ok) {
          const config = await res.json();
          if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
            url = config.SUPABASE_URL;
            key = config.SUPABASE_ANON_KEY;
          }
        }
      } catch (e) {
        // 로컬 파일 직접 열기 등 네트워크 요청 불가 환경
      }
    }

    if (url && key && url !== 'YOUR_SUPABASE_URL' && window.supabase) {
      try {
        supabase = window.supabase.createClient(url, key);
        console.log('✅ Supabase 환경 변수 연결 성공');
        await fetchTasksFromSupabase();
      } catch (err) {
        console.warn('⚠️ Supabase init warning:', err);
      }
    } else {
      console.log('ℹ️ Supabase 환경 변수가 설정되지 않아 로컬 저장소 모드로 작동합니다.');
    }
  }

  // Sample initial data if storage is empty
  const SAMPLE_TASKS = [
    {
      id: 'sample-1',
      title: ' Smart Task Planner 기능 살펴보기',
      description: '새로운 할 일을 추가하고 마감일과 카테고리를 설정해 보세요.',
      category: '개인',
      priority: 'high',
      dueDate: getFormattedDate(0), // Today
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    },
    {
      id: 'sample-2',
      title: '주간 팀 싱크업 회의 자료 준비',
      description: '상반기 성과 및 프로젝트 진행 현황 스라이드 작성하기',
      category: '업무',
      priority: 'high',
      dueDate: getFormattedDate(1), // Tomorrow
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    },
    {
      id: 'sample-3',
      title: '30분 유산소 운동 및 스트레칭',
      description: '건강한 라이프스타일을 위한 일일 유산소 운동',
      category: '건강',
      priority: 'medium',
      dueDate: getFormattedDate(0),
      completed: true,
      completedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    },
    {
      id: 'sample-4',
      title: '모던 바닐라 JavaScript ES2026 학습',
      description: '최신 웹 개발 기술 동향 파악 및 개인 토이 프로젝트 적용',
      category: '공부',
      priority: 'low',
      dueDate: getFormattedDate(3),
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString()
    }
  ];

  // Helper function to format date offset from today
  function getFormattedDate(offsetDays = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // State
  let tasks = loadTasks();
  let currentFilters = {
    search: '',
    status: 'all',
    category: 'all',
    priority: 'all',
    sortBy: 'dueDate'
  };

  // DOM Elements
  const appContainer = document.documentElement;
  const taskListContainer = document.getElementById('task-list-container');
  const emptyState = document.getElementById('empty-state');
  const currentDateText = document.getElementById('current-date-text');

  // Stats Elements
  const statTotal = document.getElementById('stat-total-tasks');
  const statToday = document.getElementById('stat-today-tasks');
  const statRate = document.getElementById('stat-completion-rate');
  const statDoneCount = document.getElementById('stat-done-count');
  const progressBarFill = document.getElementById('progress-bar-fill');

  // Filter & Search Controls
  const inputSearch = document.getElementById('input-search');
  const filterStatusGroup = document.getElementById('filter-status-group');
  const filterCategory = document.getElementById('filter-category');
  const filterPriority = document.getElementById('filter-priority');
  const selectSort = document.getElementById('select-sort');

  // Modals
  const modalTaskForm = document.getElementById('modal-task-form');
  const taskForm = document.getElementById('task-form');
  const modalFormTitle = document.getElementById('modal-form-title');
  const formTaskId = document.getElementById('form-task-id');
  const formTitle = document.getElementById('form-title');
  const formDesc = document.getElementById('form-desc');
  const formCategory = document.getElementById('form-category');
  const formPriority = document.getElementById('form-priority');
  const formDueDate = document.getElementById('form-due-date');

  const modalStats = document.getElementById('modal-stats');

  // Theme Toggle Button
  const btnThemeToggle = document.getElementById('btn-theme-toggle');

  // Initialize App
  init();

  function init() {
    initTheme();
    updateDateDisplay();
    attachEventListeners();
    render();
    initSupabase();
  }

  /* ==========================================================================
     Storage & Persistence (Local & Supabase Hybrid)
     ========================================================================== */
  function loadTasks() {
    const stored = localStorage.getItem(STORAGE_KEY_TASKS);
    if (!stored) {
      localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(SAMPLE_TASKS));
      return SAMPLE_TASKS;
    }
    try {
      return JSON.parse(stored);
    } catch (e) {
      console.error('Failed to parse tasks from localStorage', e);
      return [];
    }
  }

  function saveTasks() {
    localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
    render();
  }

  // DB <-> Frontend Task Mappers
  function toDBTask(task) {
    return {
      id: task.id,
      title: task.title,
      description: task.description || '',
      category: task.category || '개인',
      priority: task.priority || 'medium',
      due_date: task.dueDate || null,
      completed: !!task.completed,
      created_at: task.createdAt || new Date().toISOString()
    };
  }

  function fromDBTask(row) {
    return {
      id: row.id,
      title: row.title,
      description: row.description || '',
      category: row.category || '개인',
      priority: row.priority || 'medium',
      dueDate: row.due_date || '',
      completed: !!row.completed,
      completedAt: row.completed ? (row.created_at || new Date().toISOString()) : null,
      createdAt: row.created_at || new Date().toISOString()
    };
  }

  // Supabase Async Operations
  async function fetchTasksFromSupabase() {
    if (!supabase) return;
    try {
      const { data, error } = await supabase
        .from('todos')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('💡 Supabase 테이블 확인 안내 (현재 로컬 모드로 안전하게 작동 중):', error.message);
        return;
      }

      if (data && data.length > 0) {
        tasks = data.map(fromDBTask);
        localStorage.setItem(STORAGE_KEY_TASKS, JSON.stringify(tasks));
        render();
        console.log('☁️ Supabase에서 할 일 목록을 성공적으로 불러왔습니다:', tasks.length + '개');
      } else if (data && data.length === 0 && tasks.length > 0) {
        // DB 테이블이 비어있는 경우 초기 샘플 데이터 클라우드 동기화
        syncAllToSupabase();
      }
    } catch (err) {
      console.error('Supabase fetch error:', err);
    }
  }

  async function syncAllToSupabase() {
    if (!supabase || tasks.length === 0) return;
    try {
      const dbRows = tasks.map(toDBTask);
      const { error } = await supabase.from('todos').upsert(dbRows);
      if (!error) console.log('☁️ Supabase에 초기 데이터를 성공적으로 업로드했습니다.');
    } catch (err) {
      console.warn('Supabase sync warning:', err);
    }
  }

  async function insertSupabaseTask(task) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('todos').insert([toDBTask(task)]);
      if (error) console.warn('Supabase insert warning:', error.message);
      else console.log('☁️ Supabase에 새 할 일이 저장되었습니다:', task.title);
    } catch (err) {
      console.error('Supabase insert error:', err);
    }
  }

  async function updateSupabaseTask(task) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('todos').update(toDBTask(task)).eq('id', task.id);
      if (error) console.warn('Supabase update warning:', error.message);
    } catch (err) {
      console.error('Supabase update error:', err);
    }
  }

  async function deleteSupabaseTask(id) {
    if (!supabase) return;
    try {
      const { error } = await supabase.from('todos').delete().eq('id', id);
      if (error) console.warn('Supabase delete warning:', error.message);
      else console.log('☁️ Supabase에서 할 일이 삭제되었습니다 (id):', id);
    } catch (err) {
      console.error('Supabase delete error:', err);
    }
  }

  /* ==========================================================================
     Theme Switcher
     ========================================================================== */
  function initTheme() {
    const savedTheme = localStorage.getItem(STORAGE_KEY_THEME) || 'dark';
    setTheme(savedTheme);
  }

  function setTheme(theme) {
    appContainer.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY_THEME, theme);
    const icon = btnThemeToggle.querySelector('i');
    if (theme === 'light') {
      icon.className = 'fa-solid fa-sun';
      btnThemeToggle.style.color = '#f59e0b';
    } else {
      icon.className = 'fa-solid fa-moon';
      btnThemeToggle.style.color = 'var(--text-secondary)';
    }
  }

  function toggleTheme() {
    const currentTheme = appContainer.getAttribute('data-theme');
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  }

  /* ==========================================================================
     UI Render & Filtering Engine
     ========================================================================== */
  function updateDateDisplay() {
    const now = new Date();
    const options = { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' };
    currentDateText.textContent = `${now.toLocaleDateString('ko-KR', options)} · 오늘도 파이팅!`;
  }

  function getFilteredAndSortedTasks() {
    return tasks
      .filter(task => {
        // Search Filter
        if (currentFilters.search) {
          const q = currentFilters.search.toLowerCase();
          const matchTitle = task.title.toLowerCase().includes(q);
          const matchDesc = task.description && task.description.toLowerCase().includes(q);
          if (!matchTitle && !matchDesc) return false;
        }

        // Status Filter
        if (currentFilters.status === 'active' && task.completed) return false;
        if (currentFilters.status === 'completed' && !task.completed) return false;

        // Category Filter
        if (currentFilters.category !== 'all' && task.category !== currentFilters.category) return false;

        // Priority Filter
        if (currentFilters.priority !== 'all' && task.priority !== currentFilters.priority) return false;

        return true;
      })
      .sort((a, b) => {
        if (currentFilters.sortBy === 'dueDate') {
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return a.dueDate.localeCompare(b.dueDate);
        } else if (currentFilters.sortBy === 'priority') {
          const priorityWeight = { high: 3, medium: 2, low: 1 };
          return (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
        } else if (currentFilters.sortBy === 'createdAt') {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }
        return 0;
      });
  }

  function render() {
    renderDashboardStats();
    renderFilterPillCounts();

    const filtered = getFilteredAndSortedTasks();

    if (filtered.length === 0) {
      taskListContainer.style.display = 'none';
      emptyState.style.display = 'flex';
    } else {
      taskListContainer.style.display = 'grid';
      emptyState.style.display = 'none';
      taskListContainer.innerHTML = filtered.map(task => createTaskCardHTML(task)).join('');
    }
  }

  function renderDashboardStats() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const todayStr = getFormattedDate(0);
    const todayDueCount = tasks.filter(t => !t.completed && t.dueDate === todayStr).length;

    const rate = total === 0 ? 0 : Math.round((completed / total) * 100);

    statTotal.textContent = total;
    statToday.textContent = todayDueCount;
    statRate.textContent = `${rate}%`;
    statDoneCount.textContent = `${completed}/${total} 완료`;
    progressBarFill.style.width = `${rate}%`;
  }

  function renderFilterPillCounts() {
    const countAll = tasks.length;
    const countActive = tasks.filter(t => !t.completed).length;
    const countCompleted = tasks.filter(t => t.completed).length;

    document.getElementById('count-pill-all').textContent = `(${countAll})`;
    document.getElementById('count-pill-active').textContent = `(${countActive})`;
    document.getElementById('count-pill-completed').textContent = `(${countCompleted})`;
  }

  function createTaskCardHTML(task) {
    const categoryIcons = {
      '업무': '💼',
      '개인': '👤',
      '공부': '📚',
      '건강': '🏋️',
      '쇼핑': '🛒',
      '기타': '📌'
    };

    const priorityLabels = {
      high: '높음',
      medium: '보통',
      low: '낮음'
    };

    // Due Date calculation
    let dueDateHTML = '';
    if (task.dueDate) {
      const today = getFormattedDate(0);
      const isOverdue = !task.completed && task.dueDate < today;
      const isToday = task.dueDate === today;

      let dueLabel = task.dueDate;
      if (isToday) dueLabel = '오늘 마감';
      else if (isOverdue) dueLabel = `마감 초과 (${task.dueDate})`;

      dueDateHTML = `
        <span class="badge badge-due ${isOverdue ? 'overdue' : ''}">
          <i class="fa-regular fa-calendar"></i> ${dueLabel}
        </span>
      `;
    }

    return `
      <div class="task-card glass-card ${task.completed ? 'completed' : ''}" data-id="${task.id}" data-priority="${task.priority}">
        <label class="checkbox-wrapper" title="${task.completed ? '미완료로 변경' : '완료 처리'}">
          <input type="checkbox" class="task-toggle-cb" data-id="${task.id}" ${task.completed ? 'checked' : ''}>
          <div class="custom-checkbox">
            <i class="fa-solid fa-check"></i>
          </div>
        </label>

        <div class="task-content">
          <div class="task-header-row">
            <h3 class="task-title">${escapeHTML(task.title)}</h3>
          </div>
          ${task.description ? `<p class="task-desc">${escapeHTML(task.description)}</p>` : ''}
          
          <div class="task-meta-row">
            <span class="badge badge-priority-${task.priority}">
              ${priorityLabels[task.priority] || '보통'}
            </span>
            <span class="badge badge-category">
              ${categoryIcons[task.category] || '📌'} ${escapeHTML(task.category)}
            </span>
            ${dueDateHTML}
          </div>
        </div>

        <div class="task-actions">
          <button class="action-btn edit-btn" data-id="${task.id}" title="수정">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="action-btn delete-btn" data-id="${task.id}" title="삭제">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
    `;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return str.replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  /* ==========================================================================
     Event Handlers & Interactivity
     ========================================================================== */
  function attachEventListeners() {
    // Theme Switch
    btnThemeToggle.addEventListener('click', toggleTheme);

    // Search Input
    inputSearch.addEventListener('input', (e) => {
      currentFilters.search = e.target.value.trim();
      render();
    });

    // Filter Pills Status
    filterStatusGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.pill-btn');
      if (!btn) return;
      filterStatusGroup.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilters.status = btn.dataset.status;
      render();
    });

    // Dropdown Filters
    filterCategory.addEventListener('change', (e) => {
      currentFilters.category = e.target.value;
      render();
    });

    filterPriority.addEventListener('change', (e) => {
      currentFilters.priority = e.target.value;
      render();
    });

    selectSort.addEventListener('change', (e) => {
      currentFilters.sortBy = e.target.value;
      render();
    });

    // Task List Card Delegated Actions (Toggle, Edit, Delete)
    taskListContainer.addEventListener('click', (e) => {
      const toggleCb = e.target.closest('.task-toggle-cb');
      if (toggleCb) {
        const id = toggleCb.dataset.id;
        toggleTaskComplete(id, toggleCb.checked, e);
        return;
      }

      const editBtn = e.target.closest('.edit-btn');
      if (editBtn) {
        const id = editBtn.dataset.id;
        openTaskFormModal(id);
        return;
      }

      const deleteBtn = e.target.closest('.delete-btn');
      if (deleteBtn) {
        const id = deleteBtn.dataset.id;
        deleteTask(id);
        return;
      }
    });

    // Open Add Modal Buttons
    document.getElementById('btn-open-add-modal').addEventListener('click', () => openTaskFormModal());
    document.getElementById('btn-empty-add').addEventListener('click', () => openTaskFormModal());

    // Task Form Submission
    taskForm.addEventListener('submit', handleTaskFormSubmit);

    // Close Modal Buttons
    document.getElementById('btn-close-task-modal').addEventListener('click', closeTaskFormModal);
    document.getElementById('btn-cancel-task-form').addEventListener('click', closeTaskFormModal);
    
    // Modal Overlay backdrop click
    modalTaskForm.addEventListener('click', (e) => {
      if (e.target === modalTaskForm) closeTaskFormModal();
    });

    // Stats Modal
    document.getElementById('btn-open-stats').addEventListener('click', openStatsModal);
    document.getElementById('btn-close-stats-modal').addEventListener('click', closeStatsModal);
    document.getElementById('btn-confirm-stats').addEventListener('click', closeStatsModal);
    modalStats.addEventListener('click', (e) => {
      if (e.target === modalStats) closeStatsModal();
    });

    // Export Data JSON
    document.getElementById('btn-export-data').addEventListener('click', exportDataJSON);

    // Import Data JSON
    document.getElementById('file-import-json').addEventListener('change', importDataJSON);
  }

  /* ==========================================================================
     Task Actions (CRUD)
     ========================================================================== */
  function toggleTaskComplete(id, isChecked, event) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    task.completed = isChecked;
    task.completedAt = isChecked ? new Date().toISOString() : null;

    if (isChecked && event) {
      triggerConfetti(event.clientX, event.clientY);
    }

    saveTasks();
    updateSupabaseTask(task);
  }

  function deleteTask(id) {
    if (!confirm('이 할 일을 정말로 삭제하시겠습니까?')) return;
    tasks = tasks.filter(t => t.id !== id);
    saveTasks();
    deleteSupabaseTask(id);
  }

  function openTaskFormModal(taskId = null) {
    taskForm.reset();
    if (taskId) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        modalFormTitle.textContent = '할 일 수정';
        formTaskId.value = task.id;
        formTitle.value = task.title;
        formDesc.value = task.description || '';
        formCategory.value = task.category || '개인';
        formPriority.value = task.priority || 'medium';
        formDueDate.value = task.dueDate || '';
      }
    } else {
      modalFormTitle.textContent = '새 할 일 추가';
      formTaskId.value = '';
      formDueDate.value = getFormattedDate(0);
    }
    modalTaskForm.classList.add('active');
    setTimeout(() => formTitle.focus(), 100);
  }

  function closeTaskFormModal() {
    modalTaskForm.classList.remove('active');
  }

  function handleTaskFormSubmit(e) {
    e.preventDefault();
    const id = formTaskId.value;
    const title = formTitle.value.trim();
    if (!title) return;

    const category = formCategory.value;
    const priority = formPriority.value;
    const dueDate = formDueDate.value;
    const description = formDesc.value.trim();

    if (id) {
      // Edit existing task
      const task = tasks.find(t => t.id === id);
      if (task) {
        task.title = title;
        task.description = description;
        task.category = category;
        task.priority = priority;
        task.dueDate = dueDate;
        saveTasks();
        updateSupabaseTask(task);
      }
    } else {
      // Add new task
      const newTask = {
        id: 'task-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
        title,
        description,
        category,
        priority,
        dueDate,
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString()
      };
      tasks.unshift(newTask);
      saveTasks();
      insertSupabaseTask(newTask);
    }

    closeTaskFormModal();
  }

  /* ==========================================================================
     Statistics Modal Engine
     ========================================================================== */
  function openStatsModal() {
    const total = tasks.length;
    const completed = tasks.filter(t => t.completed).length;
    const rate = total === 0 ? 0 : Math.round((completed / total) * 100);

    document.getElementById('stats-total-val').textContent = total;
    document.getElementById('stats-completed-val').textContent = completed;
    document.getElementById('stats-rate-val').textContent = `${rate}%`;

    // Streak calculation
    let streak = 0;
    if (completed > 0) {
      streak = Math.min(completed, 7); // Simplistic productive streak visualization
    }
    document.getElementById('stats-streak-val').textContent = `${streak}일`;

    // Category breakdown
    const categoryCounts = {};
    tasks.forEach(t => {
      categoryCounts[t.category] = (categoryCounts[t.category] || 0) + 1;
    });

    const breakdownContainer = document.getElementById('category-breakdown-container');
    if (total === 0) {
      breakdownContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">기록된 통계가 없습니다.</div>';
    } else {
      breakdownContainer.innerHTML = Object.entries(categoryCounts).map(([cat, count]) => {
        const catPct = Math.round((count / total) * 100);
        return `
          <div class="cat-bar-item">
            <div class="cat-bar-header">
              <span>${cat}</span>
              <span>${count}개 (${catPct}%)</span>
            </div>
            <div class="progress-container">
              <div class="progress-bar-fill" style="width: ${catPct}%; background: var(--accent-primary);"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    modalStats.classList.add('active');
  }

  function closeStatsModal() {
    modalStats.classList.remove('active');
  }

  /* ==========================================================================
     Export / Import JSON Data
     ========================================================================== */
  function exportDataJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tasks, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `todolist_backup_${getFormattedDate(0)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  }

  function importDataJSON(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const imported = JSON.parse(evt.target.result);
        if (Array.isArray(imported)) {
          tasks = imported;
          saveTasks();
          alert('데이터를 성공적으로 불러왔습니다!');
        } else {
          alert('올바르지 않은 데이터 형식입니다.');
        }
      } catch (err) {
        alert('JSON 파일을 로드하는 동안 오류가 발생했습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  /* ==========================================================================
     Canvas Micro Confetti Animation
     ========================================================================== */
  function triggerConfetti(originX, originY) {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#6366f1', '#8b5cf6', '#ec4899', '#10b981', '#f59e0b', '#3b82f6'];

    const startX = originX || window.innerWidth / 2;
    const startY = originY || window.innerHeight / 2;

    for (let i = 0; i < 40; i++) {
      particles.push({
        x: startX,
        y: startY,
        vx: (Math.random() - 0.5) * 12,
        vy: (Math.random() - 0.7) * 12,
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rSpeed: (Math.random() - 0.5) * 10,
        opacity: 1
      });
    }

    let animationFrame;
    function renderConfetti() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;

      particles.forEach(p => {
        if (p.opacity <= 0) return;
        alive = true;
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.3; // Gravity
        p.opacity -= 0.02;
        p.rotation += p.rSpeed;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (alive) {
        animationFrame = requestAnimationFrame(renderConfetti);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationFrame);
      }
    }

    renderConfetti();
  }
});
