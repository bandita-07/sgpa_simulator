const GP_MAP = { 'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'D': 4, 'F': 0 };

const GRADES = [
  { label: 'O - Outstanding', value: 'O' },
  { label: 'A+ - Excellent', value: 'A+' },
  { label: 'A - Very Good', value: 'A' },
  { label: 'B+ - Good', value: 'B+' },
  { label: 'B - Average', value: 'B' },
  { label: 'C - Pass', value: 'C' },
  { label: 'D - Marginal', value: 'D' },
  { label: 'F - Fail', value: 'F' }
];

const SCHOLARSHIPS = [
  { name: 'Premier Merit Fellowship', minCGPA: 9.0 },
  { name: 'Merit Honors Scholarship', minCGPA: 8.0 },
  { name: 'State Academic Award', minCGPA: 7.5 },
  { name: 'University Grant Standing', minCGPA: 7.0 },
  { name: 'Good Standing Threshold', minCGPA: 6.0 },
  { name: 'Academic Probation Warning', minCGPA: 5.0 }
];

let currentUser = null;
let currentSubjects = [];
let whatifSubjects = [];
let nextId = 1;

// ----------------- AUTHENTICATION (LOCALSTORAGE) ----------------- //

function toggleAuthForms(showRegister) {
  document.getElementById('loginSection').style.display = showRegister ? 'none' : 'block';
  document.getElementById('registerSection').style.display = showRegister ? 'block' : 'none';
  hideFlash();
}

function showFlash(msg) {
  const el = document.getElementById('authFlash');
  el.textContent = msg;
  el.style.display = 'block';
}

function hideFlash() {
  document.getElementById('authFlash').style.display = 'none';
}

function handleRegister(e) {
  e.preventDefault();
  const username = document.getElementById('regUser').value.trim();
  const password = document.getElementById('regPass').value.trim();

  const users = JSON.parse(localStorage.getItem('mocha_users') || '{}');
  if (users[username]) {
    showFlash('Username already taken. Please choose another.');
    return;
  }

  users[username] = { password };
  localStorage.setItem('mocha_users', JSON.stringify(users));
  loginUserSession(username);
}

function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUser').value.trim();
  const password = document.getElementById('loginPass').value.trim();

  const users = JSON.parse(localStorage.getItem('mocha_users') || '{}');
  if (users[username] && users[username].password === password) {
    loginUserSession(username);
  } else {
    showFlash('Invalid username or password.');
  }
}

function loginUserSession(username) {
  currentUser = username;
  localStorage.setItem('mocha_current_session', username);
  hideFlash();
  loadUserData();
  updateAuthUI(true);
}

function logoutUser() {
  currentUser = null;
  localStorage.removeItem('mocha_current_session');
  updateAuthUI(false);
}

function updateAuthUI(isLoggedIn) {
  document.getElementById('authSection').style.display = isLoggedIn ? 'none' : 'flex';
  document.getElementById('appSection').style.display = isLoggedIn ? 'block' : 'none';
  document.getElementById('userNavSection').style.display = isLoggedIn ? 'flex' : 'none';
  if (isLoggedIn) {
    document.getElementById('navUsername').textContent = currentUser;
  }
}

// ----------------- DATA MANAGEMENT ----------------- //

function saveUserData() {
  if (!currentUser) return;
  const data = {
    pastCGPA: document.getElementById('pastCGPA').value,
    pastCredits: document.getElementById('pastCredits').value,
    currentSubjects,
    whatifSubjects
  };
  localStorage.setItem(`mocha_data_${currentUser}`, JSON.stringify(data));
}

function loadUserData() {
  if (!currentUser) return;
  const saved = localStorage.getItem(`mocha_data_${currentUser}`);
  if (saved) {
    const data = JSON.parse(saved);
    document.getElementById('pastCGPA').value = data.pastCGPA || '';
    document.getElementById('pastCredits').value = data.pastCredits || '';
    currentSubjects = data.currentSubjects || [];
    whatifSubjects = data.whatifSubjects || [];

    const allIds = [...currentSubjects, ...whatifSubjects].map(s => s.id || 0);
    if (allIds.length > 0) nextId = Math.max(...allIds) + 1;
  } else {
    currentSubjects = [];
    whatifSubjects = [];
    document.getElementById('pastCGPA').value = '';
    document.getElementById('pastCredits').value = '';
  }
  renderList('current');
  renderList('whatif');
  recalculateAll();
}

// ----------------- CORE SIMULATION LOGIC ----------------- //

function calculateStats(subjects) {
  let totalPts = 0;
  let totalCredits = 0;
  subjects.forEach(s => {
    const cr = parseFloat(s.credits) || 0;
    const gp = GP_MAP[s.grade] ?? 0;
    totalPts += cr * gp;
    totalCredits += cr;
  });
  return {
    sgpa: totalCredits > 0 ? (totalPts / totalCredits) : null,
    credits: totalCredits,
    points: totalPts
  };
}

function recalculateAll() {
  const pastCGPA = parseFloat(document.getElementById('pastCGPA').value) || 0;
  const pastCredits = parseFloat(document.getElementById('pastCredits').value) || 0;
  const pastPoints = pastCGPA * pastCredits;

  const curStats = calculateStats(currentSubjects);
  const newTotalCredits = pastCredits + curStats.credits;
  const newTotalPoints = pastPoints + curStats.points;
  const newCGPA = newTotalCredits > 0 ? (newTotalPoints / newTotalCredits) : null;

  const wifStats = calculateStats(whatifSubjects);
  const projCredits = newTotalCredits + wifStats.credits;
  const projPoints = newTotalPoints + wifStats.points;
  const projCGPA = projCredits > 0 ? (projPoints / projCredits) : null;

  const activeCGPA = (projCGPA !== null && wifStats.credits > 0) ? projCGPA : newCGPA;

  // Render values to UI
  document.getElementById('currentSGPA').textContent = curStats.sgpa !== null ? curStats.sgpa.toFixed(2) : '-';
  document.getElementById('whatifSGPA').textContent = wifStats.sgpa !== null ? wifStats.sgpa.toFixed(2) : '-';
  document.getElementById('r-past').textContent = pastCGPA > 0 ? pastCGPA.toFixed(2) : '-';
  document.getElementById('r-sgpa').textContent = curStats.sgpa !== null ? curStats.sgpa.toFixed(2) : '-';
  document.getElementById('r-credits').textContent = curStats.credits > 0 ? curStats.credits : '-';

  const rCurrent = document.getElementById('r-current');
  if (newCGPA !== null) {
    rCurrent.textContent = newCGPA.toFixed(2);
    const diff = newCGPA - pastCGPA;
    rCurrent.className = 'cgpa-row-val ' + (diff > 0.005 ? 'up' : diff < -0.005 ? 'down' : '');
  } else {
    rCurrent.textContent = '-';
    rCurrent.className = 'cgpa-row-val';
  }

  updateGauge(activeCGPA);
  renderScholarships(activeCGPA);

  const projValEl = document.getElementById('projVal');
  const projSubEl = document.getElementById('projSub');
  if (projCGPA !== null) {
    projValEl.textContent = projCGPA.toFixed(2);
    const ref = newCGPA ?? pastCGPA;
    const diff = projCGPA - ref;
    const arrow = diff > 0.005 ? '▲ +' : diff < -0.005 ? '▼ ' : '';
    projSubEl.textContent = `${arrow}${Math.abs(diff).toFixed(2)} based on${wifStats.credits} future credits`;
  } else {
    projValEl.textContent = '-';
    projSubEl.textContent = 'Add what-if subjects to preview future cumulative score';
  }

  calcRequiredTarget(newCGPA, newTotalCredits);
  saveUserData();
}

function updateGauge(cgpa) {
  const fill = document.getElementById('gaugeFill');
  const num = document.getElementById('gaugeNum');
  if (!fill || !num) return;

  const arcLen = 201;
  if (cgpa !== null && !isNaN(cgpa)) {
    const ratio = Math.min(Math.max(cgpa / 10, 0), 1);
    fill.style.strokeDashoffset = arcLen - ratio * arcLen;
    num.textContent = cgpa.toFixed(2);
  } else {
    fill.style.strokeDashoffset = arcLen;
    num.textContent = '-';
  }
}

function renderScholarships(cgpa) {
  const body = document.getElementById('scholBody');
  if (!body) return;

  if (cgpa === null || isNaN(cgpa)) {
    body.innerHTML = '<div class="empty-state">Enter course grades above to check eligibility</div>';
    return;
  }

  body.innerHTML = SCHOLARSHIPS.map(s => {
    const diff = cgpa - s.minCGPA;
    const elig = diff >= 0;
    const close = diff >= -0.5 && diff < 0;
    return `
      <div class="schol-item ${elig ? 'eligible' : close ? 'close' : ''}">
        <div>
          <span class="schol-name">${s.name}</span>
          <div class="schol-thresh">Min Required: ${s.minCGPA.toFixed(1)}</div>
        </div>
        <span class="schol-status" style="font-weight:600; color: ${elig ? '#81c784' : close ? 'var(--accent-mocha)' : 'var(--text-muted)'}">
          ${elig ? 'Eligible ✓' : close ? `Need +${Math.abs(diff).toFixed(2)}` : 'Not Eligible'}
        </span>
      </div>
    `;
  }).join('');
}

function calcRequiredTarget(currentCGPA, currentCredits) {
  const el = document.getElementById('reqResult');
  const targetCGPA = parseFloat(document.getElementById('targetCGPA')?.value) || 0;
  if (!el) return;

  const wifCredits = whatifSubjects.reduce((acc, s) => acc + (parseFloat(s.credits) || 0), 0);

  if (!currentCredits || isNaN(currentCGPA)) {
    el.innerHTML = 'Enter your academic profile and current semester to calculate.';
    return;
  }
  if (targetCGPA <= currentCGPA) {
    el.innerHTML = `Achieved! Your current CGPA (<strong>${currentCGPA.toFixed(2)}</strong>) already satisfies this target.`;
    return;
  }
  if (wifCredits === 0) {
    el.innerHTML = 'Add what-if courses above to compute necessary future scores.';
    return;
  }

  const totalFutureCredits = currentCredits + wifCredits;
  const reqSGPA = (targetCGPA * totalFutureCredits - (currentCGPA * currentCredits)) / wifCredits;

  if (reqSGPA > 10.0) {
    el.innerHTML = `<span style="color:#e57373; font-weight:600;">Impossible target:</span> Even a 10.0 across your upcoming ${wifCredits} credits will not reach${targetCGPA.toFixed(2)}.`;
  } else {
    el.innerHTML = `To hit CGPA <strong>${targetCGPA.toFixed(2)}</strong>, you must maintain an average SGPA of <strong>${reqSGPA.toFixed(2)}</strong> across your upcoming${wifCredits} credits.`;
  }
}

// ----------------- SUBJECT CRUD ----------------- //

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function gradeOptions(selected) {
  return GRADES.map(g => `<option value="${g.value}" ${selected === g.value ? 'selected' : ''}>${g.label}</option>`).join('');
}

function addSubject(type) {
  const id = nextId++;
  const arr = type === 'current' ? currentSubjects : whatifSubjects;
  arr.push({ id, name: '', credits: 3.0, grade: 'A', type });
  renderList(type);
  recalculateAll();
}

function removeSubject(id, type) {
  if (type === 'current') {
    currentSubjects = currentSubjects.filter(s => s.id !== id);
  } else {
    whatifSubjects = whatifSubjects.filter(s => s.id !== id);
  }
  renderList(type);
  recalculateAll();
}

function updateSubject(id, field, val, type) {
  const arr = type === 'current' ? currentSubjects : whatifSubjects;
  const s = arr.find(s => s.id === id);
  if (s) {
    s[field] = val;
    recalculateAll();
  }
}

function renderList(type) {
  const arr = type === 'current' ? currentSubjects : whatifSubjects;
  const cont = document.getElementById(type === 'current' ? 'currentList' : 'whatifList');
  if (!cont) return;

  if (arr.length === 0) {
    cont.innerHTML = `<div class="empty-state">No courses added yet. Click "+ Add" below.</div>`;
    return;
  }

  cont.innerHTML = arr.map(s => `
    <div class="subject-row">
      <input class="subj-input" type="text" value="${escapeHtml(s.name)}" placeholder="Course name" oninput="updateSubject(${s.id}, 'name', this.value, '${type}')">
      <input class="credit-input" type="number" value="${s.credits}" min="1" max="10" oninput="updateSubject(${s.id}, 'credits', parseFloat(this.value)\vert{}\vert{}0, '${type}')">
      <select class="grade-select" onchange="updateSubject(${s.id}, 'grade', this.value, '${type}')">
        ${gradeOptions(s.grade)}
      </select>
      <button class="btn-remove" onclick="removeSubject(${s.id}, '${type}')" title="Remove">×</button>
    </div>
  `).join('');
}

// ----------------- THEME & INIT ----------------- //

function toggleMochaTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('mocha_theme', next);
  updateThemeUI(next);
}

function updateThemeUI(theme) {
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeLabel');
  if (theme === 'light') {
    icon.textContent = '🌙';
    label.textContent = 'Dark Espresso';
  } else {
    icon.textContent = '☀️';
    label.textContent = 'Light Roast';
  }
}

function scrollToApp() {
  document.getElementById('app')?.scrollIntoView({ behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('mocha_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeUI(savedTheme);

  const existingSession = localStorage.getItem('mocha_current_session');
  if (existingSession) {
    currentUser = existingSession;
    updateAuthUI(true);
    loadUserData();
  } else {
    updateAuthUI(false);
  }
});