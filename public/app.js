// State Management
let schedules = [];
let alertedScheduleIds = new Set(); // Tracks alarms triggered in the current session
let activeAlarmSchedule = null;
let activeFilter = 'all';
let apiBaseUrl = '/api'; // Same host

// Web Audio API Alarm Synthesizer
let audioCtx = null;
let alarmInterval = null;
let vibrationInterval = null;
let currentAlarmRingtone = 'default';
let previewTimeout = null;

// PWA Install Prompt state
let deferredPrompt = null;

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('✅ PWA Service Worker registered. Scope:', reg.scope))
      .catch(err => console.error('❌ Service Worker registration failed:', err));
  });
}

// Check if user is on iOS/iPhone Safari
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

// Check if app is running in Standalone (Installed PWA) mode
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// Web Audio Synthesizer Engine
function playAlarmSound(ringtone = 'default') {
  if (alarmInterval) return; // Already playing
  currentAlarmRingtone = ringtone || 'default';
  
  // Ensure AudioContext is initialized
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  
  let toggle = true;
  alarmInterval = setInterval(() => {
    if (!audioCtx || audioCtx.state === 'suspended') return;
    
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      const tone = getAlarmTone(currentAlarmRingtone, toggle);
      osc.frequency.setValueAtTime(tone.frequency, audioCtx.currentTime);
      toggle = !toggle;
      osc.type = tone.type;
      
      gain.gain.setValueAtTime(0, audioCtx.currentTime);
      gain.gain.linearRampToValueAtTime(tone.volume, audioCtx.currentTime + 0.05);
      gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + tone.duration);
      
      osc.start();
      osc.stop(audioCtx.currentTime + tone.duration + 0.05);
    } catch (e) {
      console.warn('Audio synthesis failed (waiting for interaction):', e);
    }
  }, 600);

  // Trigger Phone Vibration (Haptics) for Android
  if ('vibrate' in navigator) {
    navigator.vibrate([500, 200, 500, 200, 500]);
    vibrationInterval = setInterval(() => {
      navigator.vibrate([500, 200, 500, 200, 500]);
    }, 2000);
  }
}

function getAlarmTone(ringtone, toggle) {
  const tones = {
    default: {
      frequency: toggle ? 880 : 988,
      type: 'sine',
      volume: 0.4,
      duration: 0.35
    },
    chime: {
      frequency: toggle ? 659 : 784,
      type: 'triangle',
      volume: 0.28,
      duration: 0.55
    },
    scifi: {
      frequency: toggle ? 523 : 1175,
      type: 'sawtooth',
      volume: 0.22,
      duration: 0.28
    },
    pulse: {
      frequency: toggle ? 196 : 247,
      type: 'sine',
      volume: 0.45,
      duration: 0.5
    },
    digital: {
      frequency: toggle ? 1319 : 1568,
      type: 'square',
      volume: 0.18,
      duration: 0.18
    },
    urgent: {
      frequency: toggle ? 740 : 1047,
      type: 'square',
      volume: 0.34,
      duration: 0.24
    }
  };
  return tones[ringtone] || tones.default;
}

function previewRingtone(ringtone) {
  initOrUnlockAudio();
  stopAlarmSound();
  
  if (previewTimeout) {
    clearTimeout(previewTimeout);
    previewTimeout = null;
  }
  
  playAlarmSound(ringtone);
  previewTimeout = setTimeout(() => {
    stopAlarmSound();
    previewTimeout = null;
  }, 1800);
}

function stopAlarmSound() {
  if (alarmInterval) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
  if (vibrationInterval) {
    clearInterval(vibrationInterval);
    vibrationInterval = null;
  }
  if ('vibrate' in navigator) {
    navigator.vibrate(0); // Cancel ongoing vibration
  }
}

// Unlock Web Audio Context on mobile tap (mandatory Safari/Chrome policy)
function initOrUnlockAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  
  const unlockBanner = document.getElementById('audio-unlock-banner');
  
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().then(() => {
      console.log('🔊 AudioContext successfully unlocked!');
      unlockBanner.classList.add('hidden');
      removeAudioUnlockListeners();
    }).catch(err => {
      console.warn('Failed to unlock audio context:', err);
    });
  } else {
    unlockBanner.classList.add('hidden');
    removeAudioUnlockListeners();
  }
}

function removeAudioUnlockListeners() {
  document.removeEventListener('click', initOrUnlockAudio);
  document.removeEventListener('touchstart', initOrUnlockAudio);
}

// Add touch events to unlock audio as soon as they interact with screen
document.addEventListener('click', initOrUnlockAudio);
document.addEventListener('touchstart', initOrUnlockAudio);

// Custom Notification Toast
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  
  toastMsg.textContent = message;
  toast.className = 'toast visible';
  
  if (type === 'success') {
    toast.style.borderLeftColor = 'var(--accent-green)';
  } else if (type === 'error') {
    toast.style.borderLeftColor = 'var(--accent-red)';
  } else if (type === 'warning') {
    toast.style.borderLeftColor = 'var(--accent-orange)';
  } else {
    toast.style.borderLeftColor = 'var(--accent-purple)';
  }
  
  setTimeout(() => {
    toast.classList.remove('visible');
  }, 4000);
}

// Request Notification Permissions
function requestNotificationPermission() {
  if (!('Notification' in window)) {
    showToast('Notifications are not supported on this mobile device/browser', 'warning');
    return;
  }
  
  Notification.requestPermission().then(permission => {
    if (permission === 'granted') {
      showToast('Notifications enabled successfully!', 'success');
      document.getElementById('btn-request-notif').style.display = 'none';
    } else {
      showToast('Notifications permission denied', 'warning');
    }
  });
}

// Trigger Local Desktop Notification
function sendDesktopNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: body,
        icon: '/icons/icon.png',
        requireInteraction: true
      });
    } catch (e) {
      console.error('Notification error:', e);
    }
  }
}

// Form Validation and Default Date/Time Setter
function setDefaultDateTime() {
  const now = new Date();
  now.setMinutes(now.getMinutes() + 1);
  now.setSeconds(0);
  now.setMilliseconds(0);
  
  const tzOffset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 16);
  document.getElementById('input-datetime').value = localISOTime;
  document.getElementById('input-datetime').min = localISOTime;
}

// Fetch Schedules from Server
async function fetchSchedules() {
  try {
    const response = await fetch(`${apiBaseUrl}/schedules`);
    if (!response.ok) throw new Error('Network error fetching schedules');
    schedules = await response.json();
    updateStats();
    renderSchedules();
  } catch (error) {
    console.error('Error fetching schedules:', error);
  }
}

// Update Dashboard Statistics
function updateStats() {
  const total = schedules.length;
  const pending = schedules.filter(s => !s.is_completed).length;
  const completed = schedules.filter(s => s.is_completed).length;
  const hourly = schedules.filter(s => !s.is_completed && s.hourly_reminder).length;
  const completionPct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const circumference = 94.2;
  const offset = circumference - (completionPct / 100) * circumference;
  
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-pending').textContent = pending;
  document.getElementById('stat-hourly').textContent = hourly;
  document.getElementById('progress-text-pct').textContent = `${completionPct}%`;
  document.getElementById('progress-indicator-circle').style.strokeDashoffset = offset;
}

// Format Date / Time nicely
function formatDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// Helper to format Date Objects into UTC iCal Format: YYYYMMDDTHHMMSSZ
function formatICalDate(dateObj) {
  return dateObj.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}

// Generate and trigger download of iCalendar (.ics) file
function exportToCalendar(schedule) {
  const startDate = new Date(schedule.schedule_datetime);
  // Default calendar event duration: 30 minutes
  const endDate = new Date(startDate.getTime() + 30 * 60 * 1000);
  
  const startStr = formatICalDate(startDate);
  const endStr = formatICalDate(endDate);
  const stampStr = formatICalDate(new Date());
  
  // Format iCalendar body text
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Chronos//Schedule Manager//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${schedule.id}_${Date.now()}@chronos.app`,
    `DTSTAMP:${stampStr}`,
    `DTSTART:${startStr}`,
    `DTEND:${endStr}`,
    `SUMMARY:${schedule.title}`,
    `DESCRIPTION:${schedule.description || 'Set with Chronos Alarm Scheduler.'}`,
    // Set alarm trigger to fire at the exact start time of the event (0 minutes offset)
    'BEGIN:VALARM',
    'TRIGGER:-PT0M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Reminder: ${schedule.title}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR'
  ];
  
  const icsContent = icsLines.join('\r\n');
  
  // Create download link
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  
  link.href = url;
  const fileName = `${schedule.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.ics`;
  link.setAttribute('download', fileName);
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast('Opening native calendar...', 'success');
}

// Calculate countdown timer
function getCountdownText(isoString, isCompleted) {
  if (isCompleted) return { text: 'Completed', class: 'completed' };
  
  const targetTime = new Date(isoString).getTime();
  const now = Date.now();
  const diff = targetTime - now;
  
  if (diff <= 0) {
    const absDiff = Math.abs(diff);
    const hours = Math.floor(absDiff / 3600000);
    const mins = Math.floor((absDiff % 3600000) / 60000);
    
    let overdueText = 'Overdue ';
    if (hours > 0) overdueText += `${hours}h `;
    overdueText += `${mins}m`;
    return { text: overdueText, class: 'overdue', isOverdue: true };
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const secs = Math.floor((diff % (1000 * 60)) / 1000);
  
  let countdownText = '';
  if (days > 0) countdownText += `${days}d `;
  if (hours > 0 || days > 0) countdownText += `${hours}h `;
  countdownText += `${mins}m ${secs}s`;
  
  return { text: countdownText, class: 'pending', isOverdue: false };
}

// Render Schedule Cards list
function renderSchedules() {
  const grid = document.getElementById('schedules-list');
  grid.innerHTML = '';
  
  const filtered = schedules.filter(s => {
    if (activeFilter === 'pending') return !s.is_completed;
    if (activeFilter === 'completed') return s.is_completed;
    return true;
  });
  
  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-calendar-xmark"></i>
        <h3>No schedules</h3>
        <p>Set a schedule using the plus button!</p>
      </div>
    `;
    return;
  }
  
  filtered.sort((a, b) => {
    if (a.is_completed !== b.is_completed) {
      return a.is_completed ? 1 : -1;
    }
    return new Date(a.schedule_datetime) - new Date(b.schedule_datetime);
  });
  
  filtered.forEach(s => {
    const card = document.createElement('div');
    const countdown = getCountdownText(s.schedule_datetime, s.is_completed);
    
    let statusClass = 'status-pending';
    if (s.is_completed) {
      statusClass = 'status-completed';
    } else if (countdown.isOverdue) {
      statusClass = s.hourly_reminder ? 'status-hourly' : 'status-overdue';
    }
    
    const priority = s.priority || 'medium';
    card.className = `schedule-card ${statusClass} priority-${priority}`;
    card.setAttribute('data-id', s.id);
    
    let badgesHtml = '';
    if (s.is_completed) {
      badgesHtml += `<span class="badge badge-completed">Done</span>`;
    } else if (countdown.isOverdue) {
      badgesHtml += `<span class="badge badge-overdue">Due</span>`;
      if (s.hourly_reminder) {
        badgesHtml += `<span class="badge badge-hourly"><i class="fa-solid fa-repeat"></i> 1h</span>`;
      }
    } else {
      badgesHtml += `<span class="badge badge-pending">Active</span>`;
      if (s.hourly_reminder) {
        badgesHtml += `<span class="badge badge-hourly"><i class="fa-solid fa-repeat"></i> 1h</span>`;
      }
    }
    badgesHtml += `<span class="badge badge-${priority}">${escapeHtml(priority)}</span>`;
    
    card.innerHTML = `
      <div class="card-main">
        <div class="card-top">
          <h3 class="card-title">${escapeHtml(s.title)}</h3>
          ${badgesHtml}
        </div>
        <p class="card-desc">${escapeHtml(s.description || 'No description.')}</p>
        <div class="card-meta">
          <div class="meta-item">
            <i class="fa-solid fa-calendar"></i>
            <span>${formatDateTime(s.schedule_datetime)}</span>
          </div>
          <div class="countdown-tag ${countdown.isOverdue ? 'overdue' : ''}" id="countdown-${s.id}">
            <i class="fa-solid fa-hourglass-half"></i>
            <span>${countdown.text}</span>
          </div>
        </div>
      </div>
      <div class="card-actions">
        ${!s.is_completed ? `
          <button class="btn btn-secondary btn-sync-calendar" title="Add to iPhone Calendar">
            <i class="fa-solid fa-calendar-plus"></i>
          </button>
          <button class="btn btn-success btn-complete-task" title="Mark Completed">
            <i class="fa-solid fa-check"></i>
          </button>
        ` : ''}
        <button class="btn btn-danger btn-delete-task" title="Delete">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;
    
    // Bind Calendar sync button handler
    const syncBtn = card.querySelector('.btn-sync-calendar');
    if (syncBtn) {
      syncBtn.addEventListener('click', () => exportToCalendar(s));
    }

    const completeBtn = card.querySelector('.btn-complete-task');
    if (completeBtn) {
      completeBtn.addEventListener('click', () => completeSchedule(s.id));
    }
    
    const deleteBtn = card.querySelector('.btn-delete-task');
    deleteBtn.addEventListener('click', () => deleteSchedule(s.id));
    
    grid.appendChild(card);
  });
}

function updateCountdowns() {
  schedules.forEach(s => {
    const el = document.getElementById(`countdown-${s.id}`);
    if (el) {
      const countdown = getCountdownText(s.schedule_datetime, s.is_completed);
      el.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> <span>${countdown.text}</span>`;
      
      if (countdown.isOverdue) {
        el.classList.add('overdue');
      } else {
        el.classList.remove('overdue');
      }
    }
  });
}

// Add New Schedule Form Submission
document.getElementById('schedule-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const title = document.getElementById('input-title').value.trim();
  const description = document.getElementById('input-desc').value.trim();
  const schedule_datetime = document.getElementById('input-datetime').value;
  const hourly_reminder = document.getElementById('input-hourly').checked;
  const priority = document.getElementById('input-priority').value;
  const ringtone = document.getElementById('input-ringtone').value;
  
  if (!title || !schedule_datetime) {
    showToast('Title and Time are required.', 'error');
    return;
  }
  
  // Try initializing sound context during click handler
  initOrUnlockAudio();

  try {
    const response = await fetch(`${apiBaseUrl}/schedules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title,
        description,
        schedule_datetime,
        hourly_reminder,
        priority,
        ringtone
      })
    });
    
    if (!response.ok) throw new Error('Server responded with an error');
    
    const newSchedule = await response.json();
    schedules.push(newSchedule);
    
    showToast('Schedule created and alarm set!', 'success');
    
    // Close mobile sheet if open
    closeMobileFormDrawer();
    
    // Reset Form
    document.getElementById('input-title').value = '';
    document.getElementById('input-desc').value = '';
    document.getElementById('input-hourly').checked = false;
    document.getElementById('input-priority').value = 'medium';
    document.getElementById('input-ringtone').value = 'default';
    setDefaultDateTime();
    
    updateStats();
    renderSchedules();
  } catch (error) {
    console.error('Error creating schedule:', error);
    showToast('Failed to save schedule to server.', 'error');
  }
});

// Mark Schedule as Completed
async function completeSchedule(id) {
  try {
    const response = await fetch(`${apiBaseUrl}/schedules/${id}/complete`, {
      method: 'PUT'
    });
    
    if (!response.ok) throw new Error('Failed to update schedule');
    
    const index = schedules.findIndex(s => s.id === id);
    if (index !== -1) {
      schedules[index].is_completed = true;
    }
    
    if (activeAlarmSchedule && activeAlarmSchedule.id === id) {
      dismissAlarm();
    }
    
    showToast('Task marked as completed.', 'success');
    updateStats();
    renderSchedules();
  } catch (error) {
    console.error('Error completing schedule:', error);
  }
}

// Update Reminded Timestamp in backend
async function updateRemindedTime(id, dateISO) {
  try {
    await fetch(`${apiBaseUrl}/schedules/${id}/reminded`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ datetime: dateISO })
    });
    
    const index = schedules.findIndex(s => s.id === id);
    if (index !== -1) {
      schedules[index].last_reminded_at = dateISO;
    }
  } catch (err) {
    console.error('Failed to update database timestamp:', err);
  }
}

// Delete Schedule
async function deleteSchedule(id) {
  if (!confirm('Delete this schedule?')) return;
  
  try {
    const response = await fetch(`${apiBaseUrl}/schedules/${id}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete schedule');
    
    schedules = schedules.filter(s => s.id !== id);
    alertedScheduleIds.delete(id);
    
    if (activeAlarmSchedule && activeAlarmSchedule.id === id) {
      dismissAlarm();
    }
    
    showToast('Schedule deleted.', 'success');
    updateStats();
    renderSchedules();
  } catch (error) {
    console.error('Error deleting schedule:', error);
  }
}

// Alarm Checking Loop (runs every 1 second)
function runAlarmCheck() {
  if (activeAlarmSchedule) return; // Prevent overlapping alarms
  
  const now = Date.now();
  
  for (let s of schedules) {
    if (s.is_completed) continue;
    
    const schedTime = new Date(s.schedule_datetime).getTime();
    if (now < schedTime) continue; 
    
    if (s.snoozedUntil && now < s.snoozedUntil) continue;
    
    let shouldTrigger = false;
    
    const alreadyAlarmedThisSession = alertedScheduleIds.has(s.id);
    const hasBeenAlarmedBefore = s.last_reminded_at != null;
    
    if (!alreadyAlarmedThisSession && !hasBeenAlarmedBefore) {
      shouldTrigger = true;
    } 
    else if (s.hourly_reminder) {
      const lastRemindedTime = s.last_reminded_at ? new Date(s.last_reminded_at).getTime() : schedTime;
      const oneHourMs = 3600000; 
      
      if (now - lastRemindedTime >= oneHourMs) {
        shouldTrigger = true;
      }
    }
    
    if (shouldTrigger) {
      triggerAlarm(s);
      break; 
    }
  }
}

// Trigger Alarm Event (Visual and Audio)
function triggerAlarm(schedule) {
  activeAlarmSchedule = schedule;
  
  // 1. Play synthesized sound & vibration
  playAlarmSound(schedule.ringtone || 'default');
  
  // 2. Trigger desktop notification
  const title = `Alarm: ${schedule.title}`;
  const body = schedule.hourly_reminder 
    ? `Hourly Reminder: ${schedule.description || 'Action required!'}`
    : schedule.description || 'It is time for your scheduled task!';
  sendDesktopNotification(title, body);
  
  // 3. Update database logs
  const nowISO = new Date().toISOString();
  alertedScheduleIds.add(schedule.id);
  updateRemindedTime(schedule.id, nowISO);
  
  // 4. Dom bindings
  document.getElementById('alarm-task-title').textContent = schedule.title;
  document.getElementById('alarm-task-desc').textContent = schedule.description || 'No description.';
  document.getElementById('alarm-task-time').textContent = formatDateTime(schedule.schedule_datetime);
  
  const hourlyBadge = document.getElementById('alarm-hourly-badge');
  if (schedule.hourly_reminder) {
    hourlyBadge.classList.remove('hidden');
  } else {
    hourlyBadge.classList.add('hidden');
  }
  
  document.getElementById('alarm-overlay').classList.remove('hidden');
}

// Dismiss Alarm
function dismissAlarm() {
  stopAlarmSound();
  document.getElementById('alarm-overlay').classList.add('hidden');
  
  if (activeAlarmSchedule) {
    const id = activeAlarmSchedule.id;
    activeAlarmSchedule = null;
    completeSchedule(id);
  }
}

// Snooze Alarm (Temporarily silence for 5 minutes)
function snoozeAlarm() {
  stopAlarmSound();
  document.getElementById('alarm-overlay').classList.add('hidden');
  
  if (activeAlarmSchedule) {
    const index = schedules.findIndex(s => s.id === activeAlarmSchedule.id);
    if (index !== -1) {
      const snoozeDurationMs = 5 * 60 * 1000; 
      schedules[index].snoozedUntil = Date.now() + snoozeDurationMs;
      showToast(`Alarm snoozed for 5 minutes`, 'warning');
    }
    activeAlarmSchedule = null;
  }
}

// UI Event Listeners for alarm action buttons
document.getElementById('btn-alarm-complete').addEventListener('click', dismissAlarm);
document.getElementById('btn-alarm-snooze').addEventListener('click', snoozeAlarm);

// Sound tester
let testInterval = null;
document.getElementById('btn-test-alarm').addEventListener('click', () => {
  const btn = document.getElementById('btn-test-alarm');
  initOrUnlockAudio();
  
  if (testInterval) {
    stopAlarmSound();
    clearInterval(testInterval);
    testInterval = null;
    btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> <span class="hide-on-mobile">Test Sound</span>`;
    showToast('Sound test stopped', 'info');
    return;
  }
  
  playAlarmSound(document.getElementById('input-ringtone').value);
  btn.innerHTML = `<i class="fa-solid fa-volume-xmark"></i> <span class="hide-on-mobile">Stop Test</span>`;
  showToast('Testing alarm... Ensure device volume is active.', 'info');
  
  testInterval = setTimeout(() => {
    stopAlarmSound();
    testInterval = null;
    btn.innerHTML = `<i class="fa-solid fa-volume-high"></i> <span class="hide-on-mobile">Test Sound</span>`;
  }, 4000);
});

// Notifications
document.getElementById('btn-request-notif').addEventListener('click', requestNotificationPermission);

document.getElementById('input-ringtone').addEventListener('change', (e) => {
  previewRingtone(e.target.value);
  showToast(`Previewing ${e.target.options[e.target.selectedIndex].text}`, 'info');
});

// Filters
const filterBtns = document.querySelectorAll('.filter-btn');
filterBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    filterBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeFilter = e.target.getAttribute('data-filter');
    renderSchedules();
  });
});

// --- PWA INSTALLATION PROMPTS ---
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  const installBanner = document.getElementById('pwa-install-banner');
  installBanner.classList.remove('hidden');
});

document.getElementById('btn-pwa-install-action').addEventListener('click', () => {
  const installBanner = document.getElementById('pwa-install-banner');
  installBanner.classList.add('hidden');
  
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User installed Chronos scheduler PWA');
      }
      deferredPrompt = null;
    });
  } else if (isIOS()) {
    document.getElementById('ios-install-modal').classList.remove('hidden');
  }
});

document.getElementById('btn-pwa-close').addEventListener('click', () => {
  document.getElementById('pwa-install-banner').classList.add('hidden');
});

document.getElementById('btn-close-ios-modal').addEventListener('click', () => {
  document.getElementById('ios-install-modal').classList.add('hidden');
});

window.addEventListener('DOMContentLoaded', () => {
  if (isIOS() && !isStandalone()) {
    const installBanner = document.getElementById('pwa-install-banner');
    const installText = document.getElementById('install-text');
    installText.textContent = "Tap here to learn how to install Chronos on your iPhone.";
    installBanner.classList.remove('hidden');
  }
});

// --- MOBILE DRAWER TOGGLES ---
const formOverlaySheet = document.getElementById('form-overlay-sheet');
const fabAddSchedule = document.getElementById('fab-add-schedule');
const btnCloseForm = document.getElementById('btn-close-form');

function openMobileFormDrawer() {
  formOverlaySheet.classList.add('visible');
  initOrUnlockAudio();
}

function closeMobileFormDrawer() {
  formOverlaySheet.classList.remove('visible');
}

fabAddSchedule.addEventListener('click', openMobileFormDrawer);
btnCloseForm.addEventListener('click', closeMobileFormDrawer);

formOverlaySheet.addEventListener('click', (e) => {
  if (e.target === formOverlaySheet) {
    closeMobileFormDrawer();
  }
});

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.addEventListener('DOMContentLoaded', () => {
  if ('Notification' in window && Notification.permission === 'granted') {
    document.getElementById('btn-request-notif').style.display = 'none';
  }
  
  setDefaultDateTime();
  fetchSchedules();
  
  setInterval(() => {
    runAlarmCheck();
    updateCountdowns();
  }, 1000);
  
  setInterval(fetchSchedules, 10000);
});
