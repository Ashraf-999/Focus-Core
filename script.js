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
let audioContext;
let notificationRegistration;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./service-worker.js')
    .then((registration) => { notificationRegistration = registration; })
    .catch(() => { notificationRegistration = null; });
}

const state = {
  goal: '', reward: '', totalFocusMs: 0, breakIntervalMs: 0, breakDurationMs: 0, breaksEnabled: false,
  focusElapsedMs: 0, focusSegmentStartedAt: 0, breakStartedAt: 0, breakElapsedMs: 0,
  nextBreakAtMs: 0, status: 'focus', orientation: 'horizontal', paused: false,
  milestones: new Set(), animationFrame: 0
};

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
  if ('Notification' in window && Notification.permission === 'default') {
    await Notification.requestPermission();
  }
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
  goalDisplay.textContent = state.goal;
  rewardDisplay.textContent = state.reward;
  setupScreen.classList.add('hidden');
  completeScreen.classList.add('hidden');
  timerScreen.classList.remove('hidden');
  pauseButton.innerHTML = 'PAUSE <span aria-hidden="true">Ⅱ</span>';
  statusStrip.classList.add('hidden');
  updateDisplay(Date.now());
  cancelAnimationFrame(state.animationFrame);
  state.animationFrame = requestAnimationFrame(tick);
});

pauseButton.addEventListener('click', () => {
  if (state.status !== 'focus') return;
  if (state.paused) {
    state.paused = false;
    state.focusSegmentStartedAt = Date.now();
    pauseButton.innerHTML = 'PAUSE <span aria-hidden="true">Ⅱ</span>';
    setStatus('FOCUS RESUMED');
    state.animationFrame = requestAnimationFrame(tick);
  } else {
    state.focusElapsedMs += Date.now() - state.focusSegmentStartedAt;
    state.paused = true;
    pauseButton.innerHTML = 'RESUME <span aria-hidden="true">▶</span>';
    setStatus('TIMER PAUSED — YOUR PROGRESS IS SAVED');
    updateDisplay(Date.now());
  }
});

claimButton.addEventListener('click', () => {
  claimButton.disabled = true;
  claimButton.textContent = 'REWARD CLAIMED';
  claimedMessage.classList.remove('hidden');
});

function tick() {
  const now = Date.now();
  if (state.status === 'focus' && !state.paused) {
    const currentFocus = state.focusElapsedMs + (now - state.focusSegmentStartedAt);
    if (state.breaksEnabled && currentFocus >= state.nextBreakAtMs && state.nextBreakAtMs < state.totalFocusMs) {
      state.focusElapsedMs = state.nextBreakAtMs;
      state.status = 'break';
      state.breakStartedAt = now;
      state.breakElapsedMs = 0;
      breakModule.classList.remove('hidden');
      setStatus('BREAK TIME — RESET YOUR CIRCUITS');
      notifyUser('Break time', 'Your focus segment is complete. Take a short break.');
    }
  } else if (state.status === 'break') {
    state.breakElapsedMs = Math.min(state.breakDurationMs, now - state.breakStartedAt);
    if (state.breakElapsedMs >= state.breakDurationMs) {
      state.focusSegmentStartedAt = now;
      state.status = 'focus';
      breakModule.classList.add('hidden');
      state.nextBreakAtMs += state.breakIntervalMs;
      setStatus('BREAK COMPLETE — BACK TO WORK');
      notifyUser('Break complete', 'Your next focus segment is ready.');
    }
  }

  updateDisplay(now);
  if (state.status === 'focus' && !state.paused) {
    const elapsed = state.focusElapsedMs + (now - state.focusSegmentStartedAt);
    if (elapsed >= state.totalFocusMs) { finishSession(); return; }
  }
  state.animationFrame = requestAnimationFrame(tick);
}

function updateDisplay(now) {
  let focusElapsed = state.focusElapsedMs;
  if (state.status === 'focus' && !state.paused) focusElapsed += now - state.focusSegmentStartedAt;
  focusElapsed = Math.min(focusElapsed, state.totalFocusMs);
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
    }
  });
}

function finishSession() {
  state.status = 'complete';
  state.focusElapsedMs = state.totalFocusMs;
  cancelAnimationFrame(state.animationFrame);
  completeGoal.textContent = state.goal;
  completeReward.textContent = state.reward;
  timerScreen.classList.add('hidden');
  completeScreen.classList.remove('hidden');
}

function setStatus(message) {
  statusStrip.textContent = message;
  statusStrip.classList.remove('hidden');
}

async function notifyUser(title, message, tag = `focus-core-${Date.now()}`) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const registration = notificationRegistration || await navigator.serviceWorker.ready;
    if (registration.active) {
      registration.active.postMessage({ type: 'show-notification', title, body: message, tag });
    } else {
      new Notification(title, { body: message, silent: false });
    }
  } catch {
    new Notification(title, { body: message, silent: false });
  }

  playNotificationSound();
}

function playNotificationSound() {
  try {
    audioContext ??= new AudioContext();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(660, now);
    oscillator.frequency.setValueAtTime(880, now + 0.12);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.5);
  } catch {
    // Background browser audio can be blocked independently of notifications.
  }
}

function formatTime(milliseconds) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}
