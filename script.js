const setupScreen = document.querySelector('#setup-screen');
const timerScreen = document.querySelector('#timer-screen');
const completeScreen = document.querySelector('#complete-screen');
const setupForm = document.querySelector('#setup-form');
const goalInput = document.querySelector('#goal-input');
const durationInput = document.querySelector('#duration-input');
const rewardInput = document.querySelector('#reward-input');
const breakToggle = document.querySelector('#break-toggle');
const breakIntervalInput = document.querySelector('#break-interval-input');
const breakDurationInput = document.querySelector('#break-duration-input');
const goalDisplay = document.querySelector('#goal-display');
const rewardDisplay = document.querySelector('#reward-display');
const focusProgress = document.querySelector('#focus-progress');
const focusPercent = document.querySelector('#focus-percent');
const timeLeft = document.querySelector('#time-left');
const breakModule = document.querySelector('#break-module');
const breakProgress = document.querySelector('#break-progress');
const breakPercent = document.querySelector('#break-percent');
const breakLeft = document.querySelector('#break-left');
const statusStrip = document.querySelector('#status-strip');
const progressLayout = document.querySelector('#progress-layout');
const pauseButton = document.querySelector('#pause-button');
const completeGoal = document.querySelector('#complete-goal');
const completeReward = document.querySelector('#complete-reward');
const claimButton = document.querySelector('#claim-button');
const claimedMessage = document.querySelector('#claimed-message');
const SESSION_STORAGE_KEY = 'focus-core-session';
let notificationRegistration;
let serviceWorkerReady;

if (location.protocol === 'file:') {
  console.error('Use http://localhost:8000, not file://, for notifications.');
} else if ('serviceWorker' in navigator) {
  serviceWorkerReady = navigator.serviceWorker.register('./service-worker.js')
    .then((registration) => {
      notificationRegistration = registration;
      return navigator.serviceWorker.ready;
    })
    .catch((error) => {
      notificationRegistration = null;
      console.error('Service worker registration failed:', error);
      throw error;
    });
} else {
  console.error('Service workers are not supported in this browser.');
}

const state = {
  goal: '', reward: '', totalFocusMs: 0, breakIntervalMs: 0, breakDurationMs: 0, breaksEnabled: false,
  focusElapsedMs: 0, focusSegmentStartedAt: 0, breakStartedAt: 0, breakElapsedMs: 0,
  nextBreakAtMs: 0, status: 'focus', orientation: 'horizontal', paused: false,
  milestones: new Set(), timerHandle: 0
};

function persistSession() {
  if (state.status === 'complete') {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return;
  }
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    goal: state.goal,
    reward: state.reward,
    totalFocusMs: state.totalFocusMs,
    breakIntervalMs: state.breakIntervalMs,
    breakDurationMs: state.breakDurationMs,
    breaksEnabled: state.breaksEnabled,
    focusElapsedMs: state.focusElapsedMs,
    focusSegmentStartedAt: state.focusSegmentStartedAt,
    breakStartedAt: state.breakStartedAt,
    breakElapsedMs: state.breakElapsedMs,
    nextBreakAtMs: state.nextBreakAtMs,
    status: state.status,
    orientation: state.orientation,
    paused: state.paused,
    milestones: [...state.milestones]
  }));
}

function restoreSession() {
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY));
    if (!saved?.totalFocusMs || !['focus', 'break'].includes(saved.status)) return false;
    Object.assign(state, saved, { milestones: new Set(saved.milestones || []) });
    goalDisplay.textContent = state.goal;
    rewardDisplay.textContent = state.reward;
    progressLayout.classList.toggle('vertical', state.orientation === 'vertical');
    progressLayout.classList.toggle('horizontal', state.orientation === 'horizontal');
    setupScreen.classList.add('hidden');
    completeScreen.classList.add('hidden');
    timerScreen.classList.remove('hidden');
    pauseButton.innerHTML = state.paused ? 'RESUME <span aria-hidden="true">▶</span>' : 'PAUSE <span aria-hidden="true">Ⅱ</span>';
    reconcileSession(Date.now());
    updateDisplay(Date.now());
    if (!state.paused) state.timerHandle = setTimeout(tick, 250);
    return true;
  } catch (error) {
    console.error('Saved session restore failed:', error);
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return false;
  }
}

breakToggle.addEventListener('change', () => {
  breakIntervalInput.disabled = !breakToggle.checked;
  breakDurationInput.disabled = !breakToggle.checked;
});

document.querySelectorAll('.orientation-button').forEach((button) => {
  button.addEventListener('click', () => {
    state.orientation = button.dataset.orientation;
    progressLayout.classList.toggle('vertical', state.orientation === 'vertical');
    progressLayout.classList.toggle('horizontal', state.orientation === 'horizontal');
    document.querySelectorAll('.orientation-button').forEach((item) => item.classList.toggle('active', item === button));
    updateDisplay(Date.now());
  });
});

setupForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await requestNotificationPermission();
  state.goal = goalInput.value.trim();
  state.reward = rewardInput.value.trim();
  state.totalFocusMs = Number(durationInput.value) * 60 * 1000;
  state.breaksEnabled = breakToggle.checked;
  state.breakIntervalMs = Number(breakIntervalInput.value) * 60 * 1000;
  state.breakDurationMs = Number(breakDurationInput.value) * 60 * 1000;
  state.focusElapsedMs = 0;
  state.nextBreakAtMs = state.breakIntervalMs;
  state.milestones = new Set();
  state.status = 'focus';
  state.paused = false;
  state.focusSegmentStartedAt = Date.now();
  persistSession();
  goalDisplay.textContent = state.goal;
  rewardDisplay.textContent = state.reward;
  setupScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');
  timerScreen.classList.remove('hidden');
  pauseButton.innerHTML = 'PAUSE <span aria-hidden="true">Ⅱ</span>';
  statusStrip.classList.add('hidden');
  updateDisplay(Date.now());
  clearTimeout(state.timerHandle);
  state.timerHandle = setTimeout(tick, 250);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !state.totalFocusMs || state.paused) return;
  const now = Date.now();
  reconcileSession(now);
  updateDisplay(now);
  if (state.status === 'focus' && getFocusElapsed(now) >= state.totalFocusMs) finishSession();
});

pauseButton.addEventListener('click', () => {
  if (state.status !== 'focus') return;
  if (state.paused) {
    state.paused = false;
    state.focusSegmentStartedAt = Date.now();
    pauseButton.innerHTML = 'PAUSE <span aria-hidden="true">Ⅱ</span>';
    setStatus('FOCUS RESUMED');
    persistSession();
    state.timerHandle = setTimeout(tick, 250);
  } else {
    state.focusElapsedMs += Date.now() - state.focusSegmentStartedAt;
    state.paused = true;
    pauseButton.innerHTML = 'RESUME <span aria-hidden="true">▶</span>';
    setStatus('TIMER PAUSED — YOUR PROGRESS IS SAVED');
    persistSession();
    updateDisplay(Date.now());
  }
});

claimButton.addEventListener('click', () => {
  claimButton.disabled = true;
  claimButton.textContent = 'REWARD CLAIMED';
  claimedMessage.classList.remove('hidden');
});

function getFocusElapsed(now) {
  if (state.status === 'focus' && !state.paused) {
    return Math.min(state.totalFocusMs, state.focusElapsedMs + now - state.focusSegmentStartedAt);
  }
  return Math.min(state.totalFocusMs, state.focusElapsedMs);
}

function reconcileSession(now) {
  if (state.paused || state.status === 'complete') return;

  let transitions = 0;
  while (transitions++ < 100) {
    if (state.status === 'focus') {
      const currentFocus = state.focusElapsedMs + now - state.focusSegmentStartedAt;
      if (!state.breaksEnabled || state.nextBreakAtMs >= state.totalFocusMs || currentFocus < state.nextBreakAtMs) return;

      const breakStartedAt = state.focusSegmentStartedAt + (state.nextBreakAtMs - state.focusElapsedMs);
      state.focusElapsedMs = state.nextBreakAtMs;
      state.status = 'break';
      state.breakStartedAt = breakStartedAt;
      state.breakElapsedMs = Math.max(0, now - breakStartedAt);
      breakModule.classList.remove('hidden');
      setStatus('BREAK TIME — RESET YOUR CIRCUITS');
      notifyUser('Break time', 'Your focus segment is complete. Take a short break.');
      persistSession();
    }

    if (state.status === 'break') {
      state.breakElapsedMs = Math.min(state.breakDurationMs, Math.max(0, now - state.breakStartedAt));
      if (state.breakElapsedMs < state.breakDurationMs) return;

      state.focusSegmentStartedAt = state.breakStartedAt + state.breakDurationMs;
      state.status = 'focus';
      state.nextBreakAtMs += state.breakIntervalMs;
      breakModule.classList.add('hidden');
      setStatus('BREAK COMPLETE — BACK TO WORK');
      notifyUser('Break complete', 'Your next focus segment is ready.');
      persistSession();
    }
  }
}

function tick() {
  const now = Date.now();
  reconcileSession(now);
  updateDisplay(now);
  if (state.status === 'focus' && !state.paused && getFocusElapsed(now) >= state.totalFocusMs) { finishSession(); return; }
  // Background timers may be throttled, so tick uses timestamps and catches up after each wake-up.
  state.timerHandle = setTimeout(tick, 250);
}

function updateDisplay(now) {
  const focusElapsed = getFocusElapsed(now);
  const percentage = state.totalFocusMs ? (focusElapsed / state.totalFocusMs) * 100 : 0;
  const rounded = Math.round(percentage);
  if (state.orientation === 'vertical') {
    focusProgress.style.width = '100%';
    focusProgress.style.height = `${percentage}%`;
  } else {
    focusProgress.style.width = `${percentage}%`;
    focusProgress.style.height = '100%';
  }
  focusPercent.textContent = `${rounded}%`;
  timeLeft.textContent = formatTime(Math.max(0, state.totalFocusMs - focusElapsed));
  triggerMilestone(rounded);

  if (state.status === 'break') {
    state.breakElapsedMs = Math.min(state.breakDurationMs, Math.max(0, now - state.breakStartedAt));
    const breakPercentage = state.breakDurationMs ? (state.breakElapsedMs / state.breakDurationMs) * 100 : 0;
    if (state.orientation === 'vertical') {
      breakProgress.style.width = '100%';
      breakProgress.style.height = `${breakPercentage}%`;
    } else {
      breakProgress.style.width = `${breakPercentage}%`;
      breakProgress.style.height = '100%';
    }
    breakPercent.textContent = `${Math.round(breakPercentage)}%`;
    breakLeft.textContent = formatTime(Math.max(0, state.breakDurationMs - state.breakElapsedMs));
  }
}

function triggerMilestone(percentage) {
  [25, 50, 75, 100].forEach((milestone) => {
    if (percentage >= milestone && !state.milestones.has(milestone)) {
      state.milestones.add(milestone);
      const message = {
        25: '25% complete — Keep going!',
        50: "50% complete — You're halfway there!",
        75: '75% complete — Final stretch!',
        100: '100% complete — You did it!'
      }[milestone];
      setStatus(message.toUpperCase());
      notifyUser('Focus Timer', message, `focus-core-milestone-${milestone}`);
      persistSession();
    }
  });
}

function finishSession() {
  state.status = 'complete';
  state.focusElapsedMs = state.totalFocusMs;
  clearTimeout(state.timerHandle);
  completeGoal.textContent = state.goal;
  completeReward.textContent = state.reward;
  persistSession();
  timerScreen.classList.add('hidden');
  completeScreen.classList.remove('hidden');
}

function setStatus(message) {
  statusStrip.textContent = message;
  statusStrip.classList.remove('hidden');
}

async function notifyUser(title, message, tag = `focus-core-${Date.now()}`) {
  try {
    return await showDesktopNotification(title, message, tag);
  } catch (error) {
    console.error('Desktop notification failed:', error);
    return false;
  }
}

async function showDesktopNotification(title, message, tag) {
  if (!('Notification' in window)) {
    throw new Error('Notifications are not supported in this browser.');
  }
  if (Notification.permission !== 'granted') {
    throw new Error(`Notification permission is ${Notification.permission}. Enable it for this site in browser settings.`);
  }

  const registration = notificationRegistration || await (serviceWorkerReady || navigator.serviceWorker.ready);
  notificationRegistration = await navigator.serviceWorker.ready;
  await registration.showNotification(title, {
    body: message,
    tag,
    renotify: true,
    silent: false,
    data: { url: './' }
  });
  return true;
}

async function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.error('Notifications are not supported in this browser.');
    return 'unsupported';
  }
  if (Notification.permission === 'default') {
    try {
      return await Notification.requestPermission();
    } catch (error) {
      console.error('Notification permission request failed:', error);
      return Notification.permission;
    }
  } else {
    return Notification.permission;
  }
}

function formatTime(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

restoreSession();
