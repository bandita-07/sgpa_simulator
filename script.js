let currentSubjects = [];
let whatifSubjects = [];
let nextId = 1;

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

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function gradeOptions(selected) {
  return GRADES.map(g => 
    `<option value="${g.value}" ${selected === g.value ? 'selected' : ''}>${g.label}</option>`
  ).join('');
}

function addSubject(type) {
  const id = nextId++;
  const arr = type === 'current' ? currentSubjects : whatifSubjects;
  arr.push({ id, name: '', credits: 3.0, grade: 'A', type });
  renderList(type);
  recalcAllBackend();
}

function removeSubject(id, type) {
  if (type === 'current') {
    currentSubjects = currentSubjects.filter(s => s.id !== id);
  } else {
    whatifSubjects = whatifSubjects.filter(s => s.id !== id);
  }
  renderList(type);
  recalcAllBackend();
}

function updateSubject(id, field, val, type) {
  const arr = type === 'current' ? currentSubjects : whatifSubjects;
  const s = arr.find(s => s.id === id);
  if (s) {
    s[field] = val;
    recalcAllBackend();
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
      <input class="credit-input" type="number" value="${s.credits}" min="1" max="10" oninput="updateSubject(${s.id}, 'credits', parseFloat(this.value)||0, '${type}')">
      <select class="grade-select" onchange="updateSubject(${s.id}, 'grade', this.value, '${type}')">
        ${gradeOptions(s.grade)}
      </select>
      <button class="btn-remove" onclick="removeSubject(${s.id}, '${type}')" title="Remove">×</button>
    </div>
  `).join('');
}

async function recalcAllBackend() {
  const pastCGPA = parseFloat(document.getElementById('pastCGPA')?.value) || 0;
  const pastCredits = parseFloat(document.getElementById('pastCredits')?.value) || 0;

  const payload = {
    pastCGPA,
    pastCredits,
    currentSubjects,
    whatifSubjects
  };

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) return;
    const data = await res.json();

    document.getElementById('currentSGPA').textContent = data.currentSGPA !== null ? data.currentSGPA.toFixed(2) : '-';
    document.getElementById('whatifSGPA').textContent = data.whatifSGPA !== null ? data.whatifSGPA.toFixed(2) : '-';
    document.getElementById('r-past').textContent = pastCGPA > 0 ? pastCGPA.toFixed(2) : '-';
    document.getElementById('r-sgpa').textContent = data.currentSGPA !== null ? data.currentSGPA.toFixed(2) : '-';
    document.getElementById('r-credits').textContent = data.currentCredits > 0 ? data.currentCredits : '-';

    const rCurrent = document.getElementById('r-current');
    if (data.newCGPA !== null) {
      rCurrent.textContent = data.newCGPA.toFixed(2);
      const diff = data.newCGPA - pastCGPA;
      rCurrent.className = 'cgpa-row-val ' + (diff > 0.005 ? 'up' : diff < -0.005 ? 'down' : '');
    } else {
      rCurrent.textContent = '-';
      rCurrent.className = 'cgpa-row-val';
    }

    updateGauge(data.activeCGPA);
    renderScholarships(data.activeCGPA);

    const projValEl = document.getElementById('projVal');
    const projSubEl = document.getElementById('projSub');

    if (data.projectedCGPA !== null) {
      projValEl.textContent = data.projectedCGPA.toFixed(2);
      const reference = data.newCGPA ?? pastCGPA;
      const diff = data.projectedCGPA - reference;
      const arrow = diff > 0.005 ? '▲ +' : diff < -0.005 ? '▼ ' : '';
      projSubEl.textContent = `${arrow}${Math.abs(diff).toFixed(2)} based on ${data.whatifCredits} future credits`;
    } else {
      projValEl.textContent = '-';
      projSubEl.textContent = 'Add what-if subjects to preview future cumulative score';
    }

    const currentTotalCredits = pastCredits + (data.currentCredits || 0);
    calcRequiredTarget(data.newCGPA, currentTotalCredits);

  } catch (err) {
    console.error("API calculation sync error:", err);
  }
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
    el.innerHTML = `<span style="color:#e57373; font-weight:600;">Impossible target:</span> Even a 10.0 across your upcoming ${wifCredits} credits will not reach ${targetCGPA.toFixed(2)}.`;
  } else {
    el.innerHTML = `To hit CGPA <strong>${targetCGPA.toFixed(2)}</strong>, you must maintain an average SGPA of <strong>${reqSGPA.toFixed(2)}</strong> across your upcoming ${wifCredits} credits.`;
  }
}

function scrollToApp() {
  document.getElementById('app')?.scrollIntoView({ behavior: 'smooth' });
}

// Restore user snapshot on load
window.onload = async function() {
  try {
    const response = await fetch('/api/get_profile');
    if (!response.ok) return;

    const data = await response.json();
    if (document.getElementById('pastCGPA')) {
      document.getElementById('pastCGPA').value = data.pastCGPA || '';
    }
    if (document.getElementById('pastCredits')) {
      document.getElementById('pastCredits').value = data.pastCredits || '';
    }

    currentSubjects = [];
    whatifSubjects = [];

    if (data.subjects && data.subjects.length > 0) {
      data.subjects.forEach(s => {
        if (s.type === 'current') currentSubjects.push(s);
        else whatifSubjects.push(s);
        if (s.id >= nextId) nextId = s.id + 1;
      });
    }

    renderList('current');
    renderList('whatif');
    recalcAllBackend();
  } catch (err) {
    console.error("Data load error:", err);
  }
};