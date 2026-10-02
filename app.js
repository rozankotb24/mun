const STORAGE_KEY = 'club_applications_v1';

const committees = ['IT', 'PR', 'FINANCE', 'MEDIA'];
const committeeHeads = {
  IT: 'Head of IT',
  PR: 'Head of PR',
  FINANCE: 'Head of Finance',
  MEDIA: 'Head of Media'
};

const interviewSlots = {
  IT: [
    'Monday, 10:00 AM',
    'Tuesday, 1:30 PM',
    'Wednesday, 11:00 AM',
    'Thursday, 3:00 PM'
  ],
  PR: [
    'Monday, 12:00 PM',
    'Wednesday, 2:00 PM',
    'Thursday, 10:30 AM',
    'Friday, 9:00 AM'
  ],
  FINANCE: [
    'Tuesday, 11:30 AM',
    'Wednesday, 9:30 AM',
    'Thursday, 1:00 PM',
    'Friday, 2:30 PM'
  ],
  MEDIA: [
    'Monday, 2:00 PM',
    'Tuesday, 4:00 PM',
    'Thursday, 11:00 AM',
    'Friday, 12:30 PM'
  ]
};

const defaultState = {
  IT: [],
  PR: [],
  FINANCE: [],
  MEDIA: []
};

const idFromName = (name) => name.toLowerCase().replace(/\s+/g, '-');

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultState));
    return structuredClone(defaultState);
  }

  try {
    const parsed = JSON.parse(saved);
    const merged = { ...defaultState };
    committees.forEach((committee) => {
      merged[committee] = Array.isArray(parsed[committee]) ? parsed[committee] : [];
    });
    return merged;
  } catch (error) {
    console.error('Could not parse saved data:', error);
    return structuredClone(defaultState);
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const appState = loadState();

const form = document.getElementById('applicationForm');
const committeeSelect = document.getElementById('committeeSelect');
const slotSelect = document.getElementById('slotSelect');
const committeeAccessSelect = document.getElementById('committeeAccessSelect');
const applicantList = document.getElementById('applicantList');
const dashboardSummary = document.getElementById('dashboardSummary');
const interviewModal = document.getElementById('interviewModal');
const interviewContent = document.getElementById('interviewContent');

function populateSlots(selectedCommittee = 'IT') {
  const slots = interviewSlots[selectedCommittee] || interviewSlots.IT;
  slotSelect.innerHTML = '<option value="">Choose a free slot</option>' +
    slots.map((slot) => `<option value="${slot}">${slot}</option>`).join('');
}

committeeSelect.addEventListener('change', (event) => {
  populateSlots(event.target.value || 'IT');
});

committeeAccessSelect.addEventListener('change', () => {
  renderDashboard();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();

  const formData = new FormData(form);
  const committee = formData.get('committee');
  const slot = formData.get('slot');

  if (!committee || !slot) {
    alert('Please select both a committee and an interview slot.');
    return;
  }

  const newApplicant = {
    id: Date.now(),
    firstName: formData.get('firstName').toString().trim(),
    lastName: formData.get('lastName').toString().trim(),
    email: formData.get('email').toString().trim(),
    phone: formData.get('phone').toString().trim(),
    committee,
    slot,
    status: 'pending',
    interview: null,
    createdAt: new Date().toISOString()
  };

  appState[committee].unshift(newApplicant);
  saveState(appState);
  renderDashboard();
  form.reset();
  populateSlots();

  const confirmation = document.createElement('div');
  confirmation.className = 'empty-state';
  confirmation.innerHTML = `<strong>Application submitted successfully.</strong><br />Your form has been sent to the ${committeeHeads[committee]} dashboard.`;

  const parent = form.parentElement;
  parent.appendChild(confirmation);
  setTimeout(() => confirmation.remove(), 3000);
});

function getSummaryData(committee) {
  const list = appState[committee] || [];
  return {
    total: list.length,
    pending: list.filter((item) => item.status === 'pending').length,
    completed: list.filter((item) => item.status === 'accepted' || item.status === 'rejected').length
  };
}

function renderDashboard() {
  const activeCommittee = committeeAccessSelect.value;
  const list = appState[activeCommittee] || [];
  const summary = getSummaryData(activeCommittee);

  dashboardSummary.innerHTML = `
    <div class="summary-card">
      <p class="eyebrow accent">Total Forms</p>
      <strong>${summary.total}</strong>
    </div>
    <div class="summary-card">
      <p class="eyebrow accent">Pending</p>
      <strong>${summary.pending}</strong>
    </div>
    <div class="summary-card">
      <p class="eyebrow accent">Completed</p>
      <strong>${summary.completed}</strong>
    </div>
  `;

  if (!list.length) {
    applicantList.innerHTML = '<div class="empty-state">No applications yet for this committee.</div>';
    return;
  }

  applicantList.innerHTML = list.map((applicant) => {
    const statusClass = applicant.status === 'pending'
      ? 'pending'
      : applicant.status === 'accepted'
        ? 'accepted'
        : applicant.status === 'rejected'
          ? 'rejected'
          : 'processing';

    return `
      <article class="applicant-card">
        <div class="applicant-top">
          <div class="applicant-meta">
            <h3>${applicant.firstName} ${applicant.lastName}</h3>
            <p>${applicant.email}</p>
          </div>
          <span class="badge ${statusClass}">${formatStatus(applicant.status)}</span>
        </div>

        <div class="applicant-actions">
          <div class="meta-row">
            <span class="meta-chip">Phone: ${applicant.phone}</span>
            <span class="meta-chip">Slot: ${applicant.slot}</span>
          </div>
          <button class="status-btn" data-interview-id="${applicant.id}">Interview now</button>
        </div>
      </article>
    `;
  }).join('');

  document.querySelectorAll('[data-interview-id]').forEach((button) => {
    button.addEventListener('click', () => openInterviewModal(Number(button.dataset.interviewId), activeCommittee));
  });
}

function formatStatus(status) {
  if (status === 'pending') return 'Pending';
  if (status === 'processing') return 'Interviewing';
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Rejected';
  return 'In Review';
}

function openInterviewModal(applicantId, committee) {
  const applicant = appState[committee].find((item) => item.id === applicantId);
  if (!applicant) return;

  const interviewData = applicant.interview || {
    motivation: '',
    teamwork: '',
    communication: '',
    skills: '',
    notes: '',
    rating: '4',
    photo: ''
  };

  interviewContent.innerHTML = `
    <div class="applicant-summary">
      <div class="profile-box">
        ${interviewData.photo ? `<img src="${interviewData.photo}" alt="Applicant photo">` : '<div class="profile-placeholder">A</div>'}
      </div>
      <div class="applicant-data">
        <p class="eyebrow accent">${committeeHeads[committee]}</p>
        <h4>${applicant.firstName} ${applicant.lastName}</h4>
        <p>${applicant.email}</p>
        <p>${applicant.phone}</p>
        <p>Selected slot: ${applicant.slot}</p>
      </div>
    </div>

    <form id="interviewForm" data-committee="${committee}" data-applicant-id="${applicant.id}">
      <div class="form-grid">
        <label>
          <span>Motivation</span>
          <textarea name="motivation" required>${escapeHtml(interviewData.motivation)}</textarea>
        </label>
        <label>
          <span>Teamwork & Collaboration</span>
          <textarea name="teamwork" required>${escapeHtml(interviewData.teamwork)}</textarea>
        </label>
        <label>
          <span>Communication Skills</span>
          <textarea name="communication" required>${escapeHtml(interviewData.communication)}</textarea>
        </label>
        <label>
          <span>Relevant Skills</span>
          <textarea name="skills" required>${escapeHtml(interviewData.skills)}</textarea>
        </label>
      </div>

      <div class="form-grid">
        <label>
          <span>Interview Notes</span>
          <textarea name="notes">${escapeHtml(interviewData.notes || '')}</textarea>
        </label>
        <div>
          <label>
            <span>Applicant Photo</span>
            <input type="file" id="photoUpload" accept="image/*" />
          </label>
          <div class="rating-row" style="margin-top: 12px;">
            <span>Overall rating</span>
            <select name="rating" aria-label="Overall rating">
              ${['1','2','3','4','5'].map((value) => `<option value="${value}" ${value === String(interviewData.rating || '4') ? 'selected' : ''}>${value}/5</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="modal-actions">
        <button type="button" class="secondary-btn" id="saveInterviewBtn">Save Interview</button>
        <button type="button" class="accept-btn" data-decision="accepted">Accept</button>
        <button type="button" class="reject-btn" data-decision="rejected">Reject</button>
      </div>
    </form>
  `;

  const photoUpload = document.getElementById('photoUpload');
  if (photoUpload) {
    photoUpload.addEventListener('change', (event) => {
      const [file] = event.target.files;
      if (!file) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        const activeApplicant = appState[committee].find((item) => item.id === applicantId);
        if (activeApplicant) {
          activeApplicant.interview = { ...activeApplicant.interview, photo: reader.result };
          saveState(appState);
          const imgPreview = document.querySelector('.profile-box img');
          if (imgPreview) {
            imgPreview.src = reader.result;
          }
        }
      };
      reader.readAsDataURL(file);
    });
  }

  document.getElementById('saveInterviewBtn').addEventListener('click', () => {
    saveInterviewData(applicantId, committee);
  });

  document.querySelectorAll('[data-decision]').forEach((button) => {
    button.addEventListener('click', () => {
      const decision = button.dataset.decision;
      const formElement = document.getElementById('interviewForm');
      const formData = new FormData(formElement);
      const payload = {
        motivation: formData.get('motivation'),
        teamwork: formData.get('teamwork'),
        communication: formData.get('communication'),
        skills: formData.get('skills'),
        notes: formData.get('notes'),
        rating: formData.get('rating'),
        decision
      };

      const activeApplicant = appState[committee].find((item) => item.id === applicantId);
      if (!activeApplicant) return;

      activeApplicant.interview = {
        ...(activeApplicant.interview || {}),
        ...payload,
        status: 'completed'
      };
      activeApplicant.status = decision === 'accepted' ? 'accepted' : 'rejected';
      saveState(appState);
      renderDashboard();
      closeInterviewModal();
    });
  });

  interviewModal.classList.remove('hidden');
  interviewModal.setAttribute('aria-hidden', 'false');
}

function saveInterviewData(applicantId, committee) {
  const formElement = document.getElementById('interviewForm');
  if (!formElement) return;

  const formData = new FormData(formElement);
  const activeApplicant = appState[committee].find((item) => item.id === applicantId);
  if (!activeApplicant) return;

  activeApplicant.interview = {
    ...(activeApplicant.interview || {}),
    motivation: formData.get('motivation')?.toString().trim() || '',
    teamwork: formData.get('teamwork')?.toString().trim() || '',
    communication: formData.get('communication')?.toString().trim() || '',
    skills: formData.get('skills')?.toString().trim() || '',
    notes: formData.get('notes')?.toString().trim() || '',
    rating: formData.get('rating')?.toString() || '4',
    status: 'processing'
  };

  activeApplicant.status = 'processing';
  saveState(appState);
  renderDashboard();
}

function closeInterviewModal() {
  interviewModal.classList.add('hidden');
  interviewModal.setAttribute('aria-hidden', 'true');
}

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.getElementById('closeInterviewModal').addEventListener('click', closeInterviewModal);
interviewModal.addEventListener('click', (event) => {
  if (event.target.dataset.close === 'true') {
    closeInterviewModal();
  }
});

populateSlots();
renderDashboard();
